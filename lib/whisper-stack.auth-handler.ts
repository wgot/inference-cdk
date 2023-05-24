import { Handler } from 'aws-lambda'
import { ECR } from 'aws-sdk'

export const handler: Handler = async () => {
  const ecr = new ECR({ region: process.env.AWS_REGION!, logger: console })
  const { authorizationData } = await ecr.getAuthorizationToken({ registryIds: ['763104351884', process.env.AWS_ACCOUNT_ID!] }).promise()
  return {
    Credentials: {
      Username: 'AWS',
      Password: authorizationData?.at(0)?.authorizationToken
    }
  }
}
