import { App, AwsLambdaReceiver } from '@slack/bolt'
import { AwsCallback, AwsEvent } from '@slack/bolt/dist/receivers/AwsLambdaReceiver'
import { isAxiosError } from 'axios'
import { ChatCompletionRequestMessage, Configuration, OpenAIApi } from 'openai'

const openai = new OpenAIApi(new Configuration({ apiKey: process.env.OPENAI_API_KEY }))
const awsLambdaReceiver = new AwsLambdaReceiver({ signingSecret: process.env.SLACK_SIGNING_SECRET! })
const app = new App({ token: process.env.SLACK_BOT_USER_OAUTH_TOKEN, receiver: awsLambdaReceiver })

app.event('app_mention', async ({ event, context, client, say }) => {
  if (context.retryNum)
    return
  const { channel, thread_ts, event_ts } = event
  const ts = thread_ts ?? event_ts
  await say({ channel, thread_ts: ts, text: '`system` 処理中……' })
  try {
    const messages = (await client.conversations.replies({ channel, ts }))
      .messages?.reduce<ChatCompletionRequestMessage[]>((messages, { text, user }) => {
        if (!text)
          return messages
        if (user === context.botUserId) {
          return text.startsWith('`system`')
            ? messages
            : [...messages, { role: 'assistant', content: text }]
        } else {
          return [...messages, { role: 'user', content: text }]
        }
      }, [{ role: 'system', content: `あなたは社内チャットボット<@${context.botUserId}>として社員の質問に答えます。` }])!
    const { data } = await openai.createChatCompletion({ model: 'gpt-4', messages })
    await client.chat.postMessage({ channel, thread_ts: ts, text: data.choices.map(({ message }) => message?.content).join('\n') })
    console.log(JSON.stringify({ event, context, messages, data }))
  } catch (error) {
    if (error instanceof Error) {
      const text = isAxiosError(error)
        ? JSON.stringify({ ...error.toJSON(), event, context })
        : JSON.stringify({ name: error.name, message: error.message, stack: error.stack, event, context })
      await client.chat.postMessage({ channel, thread_ts: ts, text: `\`system\` エラーが発生しました。`, blocks: [{ type: 'section', text: { type: 'plain_text', text } }] })
    }
  }
})

export const handler = async (event: AwsEvent, context: unknown, callback: AwsCallback) => {
  const handler = await awsLambdaReceiver.start()
  return handler(event, context, callback)
}
