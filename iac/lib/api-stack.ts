import path from 'node:path';
import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import {
  Architecture,
  FunctionUrlAuthType,
  Runtime,
} from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import type { Construct } from 'constructs';

export class WebAppStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Slack Webhook を受け取る Lambda
    const webhookLambda = new NodejsFunction(this, 'WebhookLambda', {
      entry: path.resolve(
        import.meta.dirname!,
        '../../lambda/server/src/index.ts'
      ),
      handler: 'handler',
      runtime: Runtime.NODEJS_24_X,
      architecture: Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(30),
      bundling: {
        minify: false,
        format: OutputFormat.CJS,
        sourceMap: true,
        nodeModules: ['@aws-sdk/client-lambda'],
      },
    });

    // Lambda に Durable Execution Callback API を呼び出す権限を付与
    webhookLambda.addToRolePolicy(
      new PolicyStatement({
        actions: [
          'lambda:SendDurableExecutionCallbackSuccess',
          'lambda:SendDurableExecutionCallbackFailure',
        ],
        resources: ['*'],
      })
    );

    // Function URL を作成
    const functionUrl = webhookLambda.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE, // Slack からのアクセスなので認証なし
    });

    new CfnOutput(this, 'WebhookUrl', {
      value: functionUrl.url,
      description: 'Slack Interactive Components の Request URL に設定',
    });
  }
}
