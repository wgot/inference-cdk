#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { BaseStack } from '../lib/base-stack'
import { WhisperStack } from '../lib/whisper-stack'

const app = new cdk.App()
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION }

const baseStack = new BaseStack(app, 'BaseStack', { env })
new WhisperStack(app, 'WhisperStack', { env, bucket: baseStack.bucket, queue: baseStack.queue }).addDependency(baseStack)
