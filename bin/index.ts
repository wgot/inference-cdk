#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { BaseStack } from '../lib/base-stack'
import { WhisperStack } from '../lib/whisper-stack'

const app = new cdk.App()
const props: cdk.StackProps = {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION
    },
    tags: {
        'user:CostCategory': 'inference-cdk'
    },
}
const baseStack = new BaseStack(app, 'BaseStack', props)
new WhisperStack(app, 'WhisperStack', { ...props, bucket: baseStack.bucket, queue: baseStack.queue }).addDependency(baseStack)
