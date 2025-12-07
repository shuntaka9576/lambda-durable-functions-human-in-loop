import path from 'node:path';
import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import {
  Architecture,
  Code,
  Function,
  FunctionUrlAuthType,
  Runtime,
} from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';

class WebhookConstruct extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

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

    webhookLambda.addToRolePolicy(
      new PolicyStatement({
        actions: [
          'lambda:SendDurableExecutionCallbackSuccess',
          'lambda:SendDurableExecutionCallbackFailure',
        ],
        resources: ['*'],
      })
    );

    const functionUrl = webhookLambda.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE,
    });

    new CfnOutput(this, 'WebhookUrl', {
      value: functionUrl.url,
      description: 'Slack Interactive Components の Request URL に設定',
    });
  }
}

class DurableConstruct extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const slackBotToken = process.env.SLACK_BOT_TOKEN;
    if (!slackBotToken) {
      throw new Error('SLACK_BOT_TOKEN 環境変数が設定されていません');
    }

    const durableLambda = new Function(this, 'DurableLambda', {
      code: Code.fromAsset(
        path.resolve(import.meta.dirname!, '../../lambda/durable/dist')
      ),
      handler: 'index.handler',
      runtime: Runtime.NODEJS_24_X,
      architecture: Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(30),
      environment: {
        SLACK_BOT_TOKEN: slackBotToken,
      },
      durableConfig: {
        executionTimeout: Duration.minutes(15),
        retentionPeriod: Duration.days(30),
      },
    });

    durableLambda.addToRolePolicy(
      new PolicyStatement({
        actions: [
          'lambda:CheckpointDurableExecution',
          'lambda:GetDurableExecutionState',
        ],
        resources: ['*'],
      })
    );
  }
}

export class MainStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    new WebhookConstruct(this, 'Server');
    new DurableConstruct(this, 'HITLWorkflow');
  }
}
