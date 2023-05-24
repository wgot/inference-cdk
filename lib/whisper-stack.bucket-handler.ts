import { SQSHandler, S3Event } from 'aws-lambda'
import { S3, SageMakerRuntime } from 'aws-sdk'

export const handler: SQSHandler = async (event) => {
  try {
    const s3Event = JSON.parse(event.Records[0].body) as S3Event
    const { Records: [{ s3: { bucket: { name }, object: { key } } }] } = s3Event
    /** @see https://docs.aws.amazon.com/ja_jp/AmazonS3/latest/userguide/notification-content-structure.html */
    if (key.startsWith('input/')) {
      const sagemaker = new SageMakerRuntime({ region: process.env.AWS_REGION! })
      await sagemaker.invokeEndpointAsync({
        EndpointName: process.env.ENDPOINT_NAME!,
        InputLocation: `s3://${name}/${key}`,
        ContentType: 'audio/x-audio',
      }).promise()
    } else {
      const s3 = new S3({ region: process.env.AWS_REGION! })
      const { Body } = await s3.getObject({
        Bucket: name,
        Key: key
      }).promise()
      console.log(name, key, Body?.toString())
    }
  } catch (error) {
    console.error(error, event)
  }
}
