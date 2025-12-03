import {
  createRetryStrategy,
  type DurableContext,
  withDurableExecution,
} from '@aws/durable-execution-sdk-js';

export const handler = withDurableExecution(
  async (event: { order_id?: string }, context: DurableContext) => {
    if (!event.order_id) {
      throw new Error('order_id is required');
    }
    const orderId = event.order_id;

    // orderIdのバリデーションチェック
    const validated = await context.step('validate-order', async () => ({
      status: 'validated',
      orderId,
    }));
    if (validated.status !== 'validated') {
      throw new Error('Validation failed');
    }
    context.logger.info(`Order validated: ${JSON.stringify(validated)}`);

    // 外部からのコールバックを待ち受けるためのIDを生成
    const [callbackPromise, callbackId] = await context.createCallback(
      'awaiting-approval',
      {
        timeout: { minutes: 3 }, // タイムアウトを設定
      }
    );
    context.logger.info(`callbackIdを生成しました: ${callbackId}`);

    // Slack側に承認/却下するメッセージを送信
    const approvalRequest = await context.step(
      'send-for-approval',
      async (stepContext) => {
        stepContext.logger.info('=== INSIDE send-for-approval step ===');
        return await sendForApproval(callbackId, orderId);
      }
    );
    context.logger.info(
      `Approval request sent: ${JSON.stringify(approvalRequest)}`
    );

    // Slack側で承認され、発行したCallbackIDで成功、失敗のAPIが実行されるか, タイムアウトまで待機
    const approvalResult = await callbackPromise;

    const result =
      typeof approvalResult === 'string'
        ? (JSON.parse(approvalResult) as { approved: boolean })
        : (approvalResult as { approved: boolean });

    if (result.approved !== true) {
      // 却下の場合、却下通知
      await context.step('notify-result', async (stepContext) => {
        stepContext.logger.info(
          `notify-result step: approved=${result.approved}`
        );
        return await sendApprovalResult(orderId, false);
      });
      return { status: 'rejected', orderId };
    }

    // 承認された場合、注文処理を実施
    const processed = await context.step(
      'process-order',
      async () => ({ status: 'processed', orderId }),
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
