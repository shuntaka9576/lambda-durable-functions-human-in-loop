import * as cdk from 'aws-cdk-lib';
import { MainStack } from '../lib/api-stack';

const app = new cdk.App();

new MainStack(app, 'main-stack');
