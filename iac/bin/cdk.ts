import * as cdk from 'aws-cdk-lib';
import { WebAppStack } from '../lib/api-stack';

const app = new cdk.App();

new WebAppStack(app, 'for-durable-lambda-stack');
