import {
  Stack,
  StackProps,
  Duration,
  aws_applicationautoscaling as aas,
  aws_ecr_assets as ecra,
  aws_cloudwatch as cw,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_lambda_event_sources as les,
  aws_s3 as s3,
  aws_sagemaker as sm,
  aws_sqs as sqs,
} from 'aws-cdk-lib'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import { Construct } from 'constructs'

interface WhisperStackProps extends StackProps {
  bucket: s3.Bucket
  queue: sqs.Queue
}
export class WhisperStack extends Stack {
  constructor(scope: Construct, id: string, props: WhisperStackProps) {
    super(scope, id, props)

    const { bucket, queue } = props
    const sagemakerRole = new iam.Role(this, 'SagemakerRole', {
      assumedBy: new iam.ServicePrincipal('sagemaker.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSageMakerFullAccess'),
      ],
    })
    bucket.grantReadWrite(sagemakerRole)
    /**
     * `aws ecr get-login-password | docker login --username AWS --password-stdin https://763104351884.dkr.ecr.ap-northeast-1.amazonaws.com`
     * @see https://docs.aws.amazon.com/ja_jp/sagemaker/latest/dg/docker-containers-adapt-your-own-private-registry-authentication.html
     */
    const authHandler = new NodejsFunction(this, 'auth-handler', {
      runtime: lambda.Runtime.NODEJS_18_X,
      environment: {
        AWS_ACCOUNT_ID: this.account
      },
    })
    authHandler.addToRolePolicy(new iam.PolicyStatement({ actions: ['ecr:GetAuthorizationToken'], resources: ['*'] }))
    authHandler.grantInvoke(sagemakerRole)

    const whisperModel = new sm.CfnModel(this, 'WhisperModel', {
      executionRoleArn: sagemakerRole.roleArn,
      primaryContainer: {
        /** @see https://zenn.dev/thorie/articles/548nl_sagemaker_whisper */
        image: new ecra.DockerImageAsset(this, 'DockerImageAsset', { directory: './', platform: ecra.Platform.LINUX_AMD64 }).imageUri,
        modelDataUrl: bucket.s3UrlForObject('model.tar.gz'),
        /**
         * @see https://docs.aws.amazon.com/ja_jp/sagemaker/latest/dg/ecr-ap-northeast-1.html#huggingface-ap-northeast-1.title
         * @see https://discuss.huggingface.co/t/deploying-open-ais-whisper-on-sagemaker/24761
         */
        // image: '763104351884.dkr.ecr.ap-northeast-1.amazonaws.com/huggingface-pytorch-inference:1.13.1-transformers4.26.0-gpu-py39-cu117-ubuntu20.04',
        imageConfig: {
          repositoryAuthConfig: {
            repositoryCredentialsProviderArn: authHandler.functionArn,
          },
          repositoryAccessMode: 'Platform',
        },
        environment: {
          MODEL_SERVER_TIMEOUT: 900,
          /** @see https://docs.aws.amazon.com/sagemaker/latest/dg/async-inference-create-endpoint.html#async-inference-create-endpoint-create-model */
          // MMS_MAX_REQUEST_SIZE: 2000000000,
          // MMS_MAX_RESPONSE_SIZE: 2000000000,
          // MMS_DEFAULT_RESPONSE_TIMEOUT: 900,
          /** @see https://huggingface.co/openai/whisper-large-v2 */
          // HF_MODEL_ID: 'openai/whisper-large-v2',
          // HF_TASK: 'automatic-speech-recognition',
          // SAGEMAKER_CONTAINER_LOG_LEVEL: 20,
          // SAGEMAKER_PROGRAM: 'inference.py',
          // SAGEMAKER_SUBMIT_DIRECTORY: '/opt/ml/model/code',
          // SAGEMAKER_REGION: this.region,
        },
      },
    })
    whisperModel.node.addDependency(sagemakerRole)
    const productionVariants: sm.CfnEndpointConfig.ProductionVariantProperty[] = [{
      variantName: 'WhisperVariant',
      modelName: whisperModel.attrModelName,
      initialInstanceCount: 1,
      initialVariantWeight: 1,
      /** @see https://aws.amazon.com/jp/sagemaker/pricing/ */
      instanceType: 'ml.p3.2xlarge',
    }]
    const whisperEndpointConfig = new sm.CfnEndpointConfig(this, 'WhisperEndpointConfig', {
      productionVariants,
      asyncInferenceConfig: {
        clientConfig: {
          maxConcurrentInvocationsPerInstance: 1,
        },
        outputConfig: {
          s3OutputPath: bucket.s3UrlForObject('output'),
          s3FailurePath: bucket.s3UrlForObject('failure'),
        },
      },
    })
    const whisperEndpoint = new sm.CfnEndpoint(this, 'WhisperEndpoint', {
      endpointName: 'WhisperEndpoint',
      endpointConfigName: whisperEndpointConfig.attrEndpointConfigName,
    })
    /** @see https://docs.aws.amazon.com/sagemaker/latest/dg/endpoint-auto-scaling-add-code-define.html */
    const target = new aas.ScalableTarget(this, 'ScalableTarget', {
      serviceNamespace: aas.ServiceNamespace.SAGEMAKER,
      resourceId: `endpoint/${whisperEndpoint.endpointName}/variant/${productionVariants.at(0)?.variantName!}`,
      scalableDimension: 'sagemaker:variant:DesiredInstanceCount',
      minCapacity: 0,
      maxCapacity: 1,
    })
    target.node.addDependency(whisperEndpoint)
    /** @see https://docs.aws.amazon.com/sagemaker/latest/dg/async-inference-monitor.html */
    target.scaleToTrackMetric('ApproximateBacklogSizePerInstanceTrackMetric', {
      targetValue: 0.99,
      customMetric: new cw.Metric({
        metricName: 'ApproximateBacklogSizePerInstance',
        namespace: 'AWS/SageMaker',
        dimensionsMap: {
          EndpointName: whisperEndpoint.endpointName!
        },
        period: Duration.minutes(1),
        statistic: 'avg',
      }),
      scaleInCooldown: Duration.seconds(300),
      scaleOutCooldown: Duration.seconds(0),
    })
    const bucketHandler = new NodejsFunction(this, 'bucket-handler', {
      runtime: lambda.Runtime.NODEJS_18_X,
      environment: {
        ENDPOINT_NAME: whisperEndpoint.endpointName!,
      },
      events: [new les.SqsEventSource(queue)],
    })
    bucketHandler.addToRolePolicy(new iam.PolicyStatement({
      actions: ['sagemaker:InvokeEndpointAsync'],
      resources: [whisperEndpoint.ref]
    }))
    bucket.grantRead(bucketHandler)
  }
}
