import {
  LambdaClient,
  SendDurableExecutionCallbackFailureCommand,
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

  if (actionData.action === 'approve') {
    const resultJson = JSON.stringify({ approved: true });
    const resultBytes = new TextEncoder().encode(resultJson);

    await lambdaClient.send(
      new SendDurableExecutionCallbackSuccessCommand({
        CallbackId: callbackId,
        Result: resultBytes,
      })
    );
  } else {
    await lambdaClient.send(
      new SendDurableExecutionCallbackFailureCommand({
        CallbackId: callbackId,
        Error: {
          ErrorMessage: 'Rejected by user',
          ErrorType: 'UserRejection',
        },
      })
    );
  }

  return c.json({ ok: true });
});

export const handler = handle(app);
