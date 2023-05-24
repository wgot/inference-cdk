import { Handler } from 'aws-lambda'
import { S3 } from 'aws-sdk'
import { create } from 'archiver'
import axios from 'axios'
import { Readable } from 'stream'

export const handler: Handler = async () => {
  const s3 = new S3({ region: process.env.AWS_REGION!, logger: console })
  const { data } = await axios.get<Readable>('https://openaipublic.azureedge.net/main/whisper/models/81f7c96c852ee8fc832187b0132e569d6c3065a3252ed18e56effd0b6a73e524/large-v2.pt', {
    onDownloadProgress: (event) => console.log(event),
    responseType: 'stream'
  })
  const archive = create('tar', { gzip: true })
  archive.append(data, { name: 'large-v2.pt' })
  archive.finalize()
  await s3.upload({
    Bucket: process.env.BUCKET_NAME!,
    Key: 'model.tar.gz',
    Body: archive,
  }).promise()
}
