import {
  createRetryStrategy,
  type DurableContext,
  withDurableExecution,
} from '@aws/durable-execution-sdk-js';

export const config = {
  name: 'Order Processing with Human Approval',
  description:
    'Demonstrates step, createCallback, and retryStrategy in TypeScript',
};

export const handler = withDurableExecution(
  async (event: { order_id?: string }, context: DurableContext) => {
    if (!event.order_id) {
      throw new Error('order_id is required');
    }
    const orderId = event.order_id;

    // Step 1: Validate the order
    const validated = await context.step('validate-order', async () => {
      return validateOrder(orderId);
    });
    if (validated.status !== 'validated') {
      throw new Error('Validation failed');
    }
    context.logger.info(`Order validated: ${JSON.stringify(validated)}`);

    // Step 2: callbackIdを生成
    const [callbackPromise, callbackId] = await context.createCallback(
      'awaiting-approval',
      {
        timeout: { minutes: 3 },
      }
    );
    context.logger.info(`callbackIdを生成しました: ${callbackId}`);
    context.logger.info('=== BEFORE send-for-approval step ===');

    // Step 3: callbackId を外部に「橋渡し」するステップ
    const approvalRequest = await context.step(
      'send-for-approval',
      async (stepContext) => {
        stepContext.logger.info('=== INSIDE send-for-approval step ===');
        return await sendForApproval(callbackId, orderId);
      }
    );
    context.logger.info('=== AFTER send-for-approval step ===');
    context.logger.info(
      `Approval request sent: ${JSON.stringify(approvalRequest)}`
    );

    // Step 4: コールバックが終了するまで待機する
    const approvalResult = await callbackPromise;
    context.logger.info(`Approval received: ${approvalResult}`);

    // Step 5: Process order with retry strategy
    const processed = await context.step(
      'process-order',
      async () => processOrder(orderId),
      {
        retryStrategy: createRetryStrategy({
          maxAttempts: 3,
          backoffRate: 2.0,
        }),
      }
    );
    if (processed.status !== 'processed') {
      throw new Error('Processing failed');
    }

    context.logger.info(
      `Order successfully processed: ${JSON.stringify(processed)}`
    );
    return processed;
  }
);

async function validateOrder(
  orderId: string
): Promise<{ status: string; orderId: string }> {
  // validate処理はモック
  return { status: 'validated', orderId };
}

async function sendForApproval(
  callbackId: string,
  orderId: string
): Promise<{ sent: boolean }> {
  console.log('=== sendForApproval START ===');
  console.log(`callbackId: ${callbackId}`);
  console.log(`orderId: ${orderId}`);

  const slackToken = process.env.SLACK_BOT_TOKEN;
  const slackChannel = process.env.SLACK_CHANNEL;

  console.log(`SLACK_BOT_TOKEN exists: ${!!slackToken}`);
  console.log(`SLACK_CHANNEL: ${slackChannel}`);

  if (!slackToken || !slackChannel) {
    throw new Error('SLACK_BOT_TOKEN and SLACK_CHANNEL are required');
  }

  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${slackToken}`,
    },
    body: JSON.stringify({
      channel: slackChannel,
      text: `注文 ${orderId} の承認をお願いします`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `注文 *${orderId}* の承認をお願いします`,
          },
        },
        {
          type: 'actions',
          block_id: 'approval_actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: '承認' },
              style: 'primary',
              value: JSON.stringify({ action: 'approve', callbackId }),
              action_id: 'approve_action',
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: '却下' },
              style: 'danger',
              value: JSON.stringify({ action: 'reject', callbackId }),
              action_id: 'reject_action',
            },
          ],
        },
      ],
    }),
  });

  const result = await response.json();
  console.log(`Slack API response: ${JSON.stringify(result)}`);

  if (!result.ok) {
    throw new Error(`Slack API error: ${result.error}`);
  }

  console.log('=== sendForApproval END ===');
  return { sent: true };
}

async function processOrder(
  orderId: string
): Promise<{ status: string; orderId: string }> {
  // 注文処理ロジック
  return { status: 'processed', orderId };
}
