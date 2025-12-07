import {
  type DurableContext,
  withDurableExecution,
} from '@aws/durable-execution-sdk-js';

export const handler = withDurableExecution(
  async (event: any, context: DurableContext) => {
    const [callbackPromise, callbackId] = await context.createCallback(
      'awaiting-approval',
      {
        timeout: { minutes: 3 }, // タイムアウトを設定
      }
    );
    context.logger.info(`callbackIdを生成しました: ${callbackId}`);

    const approvalResult = await callbackPromise;

    await context.step('notify-result', async () => {
      console.log('fin');
    });
  }
);
