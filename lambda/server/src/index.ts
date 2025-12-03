import {
  LambdaClient,
  SendDurableExecutionCallbackSuccessCommand,
} from '@aws-sdk/client-lambda';
import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';

const app = new Hono();
const lambdaClient = new LambdaClient({});

// Slack Interactive Components の Webhook エンドポイント
app.post('/webhook/slack', async (c) => {
  const body = await c.req.parseBody();
  const payload = JSON.parse(body.payload as string);

  const action = payload.actions?.[0];
  const actionData = JSON.parse(action?.value || '{}');
  const callbackId = actionData.callbackId;

  console.log('actionData:', JSON.stringify(actionData));

  const resultJson = JSON.stringify({ approved: actionData.approved });
  const resultBytes = new TextEncoder().encode(resultJson);

  await lambdaClient.send(
    new SendDurableExecutionCallbackSuccessCommand({
      CallbackId: callbackId,
      Result: resultBytes,
    })
  );

  return c.json({ ok: true });
});

export const handler = handle(app);
