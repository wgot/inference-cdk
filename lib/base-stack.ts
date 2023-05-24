import {
  Stack,
  StackProps,
  // BundlingFileAccess,
  // BundlingOutput,
  // DockerImage,
  Duration,
  RemovalPolicy,
  aws_budgets as budgets,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_s3 as s3,
  // aws_s3_deployment as s3d,
  aws_s3_notifications as s3n,
  aws_sqs as sqs,
  custom_resources as cr,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
// import { join } from 'path'

export class BaseStack extends Stack {
  public readonly bucket: s3.Bucket
  public readonly queue: sqs.Queue
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    new budgets.CfnBudget(this, 'Budget', {
      budget: {
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: {
          amount: 300,
          unit: 'USD'
        },
      },
      notificationsWithSubscribers: [{
        notification: {
          comparisonOperator: 'GREATER_THAN',
          notificationType: 'ACTUAL',
          threshold: 100,
          thresholdType: 'ABSOLUTE_VALUE',
        },
        subscribers: [{
          subscriptionType: 'EMAIL',
          address: this.node.tryGetContext('address'),
        }]
      }]
    })
    this.bucket = new s3.Bucket(this, 'Bucket', {
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
      lifecycleRules: [{
        prefix: 'input',
        expiration: Duration.days(7),
      }, {
        prefix: 'output',
        expiration: Duration.days(7),
      }]
    })
    this.queue = new sqs.Queue(this, 'Queue', {
      removalPolicy: RemovalPolicy.DESTROY,
    })
    this.bucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.SqsDestination(this.queue), { prefix: 'input/' })
    this.bucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.SqsDestination(this.queue), { prefix: 'output/' })
    /**
     * @see https://github.com/aws/sagemaker-huggingface-inference-toolkit#-user-defined-codemodules
     * @see https://github.com/aws-samples/whisper-audio-inference-for-amazon-sagemaker
     * @see https://github.com/aws/aws-cdk/issues/22988
     * `cd model && tar -czvf model.tar.gz .`
     */
    // new s3d.BucketDeployment(this, 'BucketDeployment', {
    //   destinationBucket: this.bucket,
    //   prune: false,
    //   sources: [s3d.Source.asset(join(__dirname, '../model'), {
    //     bundling: {
    //       image: DockerImage.fromRegistry('ubuntu'),
    //       bundlingFileAccess: BundlingFileAccess.BIND_MOUNT,
    //       command: ['tar', '-czvf', '/asset-output/model.tar.gz', '.'],
    //       outputType: BundlingOutput.NOT_ARCHIVED,
    //     },
    //   })],
    // })
    /** @see https://github.com/aws/aws-cdk/issues/10820 */
    const whisperModelHandler = new NodejsFunction(this, 'whisper-model-handler', {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_18_X,
      timeout: Duration.minutes(15),
      memorySize: 10240,
      environment: {
        BUCKET_NAME: this.bucket.bucketName
      },
    })
    this.bucket.grantReadWrite(whisperModelHandler)
    const lambdaTrigger = new cr.AwsCustomResource(this, 'LambdaTrigger', {
      policy: cr.AwsCustomResourcePolicy.fromStatements([new iam.PolicyStatement({
        actions: ['lambda:InvokeFunction'],
        effect: iam.Effect.ALLOW,
        resources: [whisperModelHandler.functionArn]
      })]),
      timeout: Duration.minutes(15),
      onCreate: {
        service: 'Lambda',
        action: 'invoke',
        parameters: {
          FunctionName: whisperModelHandler.functionName,
          InvocationType: 'Event'
        },
        physicalResourceId: cr.PhysicalResourceId.of('JobSenderTriggerPhysicalId')
      },
      onUpdate: {
        service: 'Lambda',
        action: 'invoke',
        parameters: {
          FunctionName: whisperModelHandler.functionName,
          InvocationType: 'Event'
        },
        physicalResourceId: cr.PhysicalResourceId.of('JobSenderTriggerPhysicalId')
      }
    })
    lambdaTrigger.node.addDependency(whisperModelHandler)
  }
}
