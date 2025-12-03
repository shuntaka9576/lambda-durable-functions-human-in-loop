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
    context.logger.info('=== BEFORE await callbackPromise ===');
    const approvalResult = await callbackPromise;
    context.logger.info('=== AFTER await callbackPromise ===');
    context.logger.info(`Approval received: ${JSON.stringify(approvalResult)}`);

    context.logger.info(`approvalResult raw = ${JSON.stringify(approvalResult)}, type = ${typeof approvalResult}`);

    // approvalResult が文字列の場合はパースする
    const result = typeof approvalResult === 'string'
      ? JSON.parse(approvalResult) as { approved: boolean }
      : approvalResult as { approved: boolean };

    context.logger.info(`result.approved = ${result.approved}, type = ${typeof result.approved}`);

    // 却下された場合
    if (result.approved !== true) {
      context.logger.info('=== REJECTED branch ===');
      await context.step('notify-result', async (stepContext) => {
        stepContext.logger.info(`notify-result step: approved=${result.approved}`);
        return await sendApprovalResult(orderId, false);
      });
      return { status: 'rejected', orderId };
    }

    // Step 5: Process order with retry strategy (承認時のみ)
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

    // Step 6: 処理成功を通知
    await context.step('notify-result', async () => {
      return await sendApprovalResult(orderId, true);
    });

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
  const slackToken = process.env.SLACK_BOT_TOKEN;
  const slackChannel = '#approvals';

  if (!slackToken) {
    throw new Error('SLACK_BOT_TOKEN is required');
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
              value: JSON.stringify({ approved: true, callbackId }),
              action_id: 'approve_action',
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: '却下' },
              style: 'danger',
              value: JSON.stringify({ approved: false, callbackId }),
              action_id: 'reject_action',
            },
          ],
        },
      ],
    }),
  });

  const result = await response.json();

  if (!result.ok) {
    throw new Error(`Slack API error: ${result.error}`);
  }

  return { sent: true };
}

async function processOrder(
  orderId: string
): Promise<{ status: string; orderId: string }> {
  // 注文処理ロジック
  return { status: 'processed', orderId };
}

async function sendApprovalResult(
  orderId: string,
  isApproved: boolean
): Promise<{ sent: boolean }> {
  const slackToken = process.env.SLACK_BOT_TOKEN;
  const resultChannel = '#approval-results';

  if (!slackToken) {
    throw new Error('SLACK_BOT_TOKEN is required');
  }
  const emoji = isApproved ? '✅' : '❌';
  const status = isApproved ? '承認' : '却下';

  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${slackToken}`,
    },
    body: JSON.stringify({
      channel: resultChannel,
      text: `${emoji} 注文 ${orderId} が${status}されました`,
    }),
  });

  const apiResult = await response.json();

  if (!apiResult.ok) {
    throw new Error(`Slack API error: ${apiResult.error}`);
  }

  return { sent: true };
}
