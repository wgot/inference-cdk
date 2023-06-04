import {
  CfnOutput,
  Duration,
  Stack,
  StackProps,
  aws_lambda as lambda,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'

export class SlackStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    const handler = new NodejsFunction(this, 'chatgpt-handler', {
      runtime: lambda.Runtime.NODEJS_18_X,
      timeout: Duration.seconds(300),
      environment: {
        OPENAI_API_KEY: this.node.tryGetContext('OPENAI_API_KEY'),
        SLACK_SIGNING_SECRET: this.node.tryGetContext('SLACK_SIGNING_SECRET'),
        SLACK_BOT_USER_OAUTH_TOKEN: this.node.tryGetContext('SLACK_BOT_USER_OAUTH_TOKEN'),
      },
    })
    const { url } = handler.addFunctionUrl({ authType: lambda.FunctionUrlAuthType.NONE })
    new CfnOutput(this, 'URL', { value: url })
  }
}
