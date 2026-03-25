# Week 8 — Serverless Image Processing

**Date:** March 19–24, 2026  
**Bootcamp Video:** Week 8 - Serverless Image Processing + Correctly Implementing Timezones for ISO 8601  

---

## Overview

This week I built a serverless image processing pipeline using AWS CDK (TypeScript) and fixed a cross-cutting timezone bug that affected both the Flask backend and React frontend. The pipeline automatically resizes avatar images when uploaded to S3 — using a Lambda function with the `sharp` library — and publishes notifications via SNS when processing completes.

I also created `bin/cdk/` automation scripts to manage the CDK lifecycle, upgraded the Lambda runtime from Node.js 18.x to 20.x (current LTS), and tied the S3 bucket name to my domain (`assets.fentoncruddur.com`) following professional cloud conventions.

The CDK stack was deployed, bootstrapped, and tested end-to-end: I uploaded an image to S3, the Lambda triggered automatically, and a processed 512x512 version appeared in the output folder within seconds.

---

## Phase 1 — Timezone Fixes for ISO 8601

### The Problem

Messages created in DynamoDB were appearing in the wrong order. When a user sent a new message, it would sometimes insert into the middle of the conversation instead of appearing at the bottom. The root cause was a timezone handling inconsistency across three layers of the application:

**Backend (Python):** `ddb.py` was generating timestamps like this:
```python
now = datetime.now(timezone.utc).astimezone().isoformat()
```
The `.astimezone()` call converts UTC to the server's local timezone — but the server's timezone depends on where the code runs. In a Codespace it might be UTC, on ECS Fargate it might be something else. This produced timestamps with different timezone offsets that sort incorrectly as DynamoDB sort keys (DynamoDB sorts `sk` values lexicographically, so `2026-03-21T14:30:00-04:00` sorts differently than `2026-03-21T18:30:00+00:00` even though they represent the same moment).

**Seed Script (Python):** The DDB seed script hardcoded `ZoneInfo('America/New_York')`, baking Eastern Time into seed data regardless of where the script runs.

**Frontend (React/Luxon):** All three datetime-rendering components called `DateTime.fromISO(value)` without specifying the timezone. When the backend sends a UTC timestamp like `2026-03-20T14:30:00+00:00`, Luxon should parse it correctly — but if the timestamp string lacks a timezone offset (which can happen depending on Python's `.isoformat()` formatting), Luxon defaults to the browser's local time. This mismatch caused "negative time ago" values like "-3 minutes ago."

### The Principle

**Store UTC everywhere. Convert to local only at the display layer.**

The backend and database should never care about timezones. They generate, store, and transmit pure UTC timestamps. The frontend — which knows the user's browser timezone — is the only place where conversion to local time should happen.

### Backend Fix — `ddb.py`

Changed two lines (in `create_message` and `create_message_group`):

```python
# Before (inconsistent — converts to server's local timezone)
now = datetime.now(timezone.utc).astimezone().isoformat()

# After (consistent UTC everywhere)
now = datetime.now(timezone.utc).isoformat()
```

This produces timestamps like `2026-03-21T18:30:00+00:00` regardless of which server or container runs the code.

### Seed Script Fix — `backend-flask/bin/ddb/seed`

Two changes:

1. Removed the `ZoneInfo` import — no longer needed since we're staying in UTC
2. Changed the `now` calculation:

```python
# Before (hardcoded Eastern Time, messages start at current time)
now = datetime.now(timezone.utc).astimezone(ZoneInfo('America/New_York'))

# After (pure UTC, offset 1 day into the past)
now = datetime.now(timezone.utc) - timedelta(days=1)
```

The one-day offset ensures all seed messages are in the past when the app loads. Without it, the seed script generates timestamps starting at "now" and incrementing by one minute per message, causing the last messages to be in the future and producing negative "time ago" values.

### Frontend Fix — `DateTimeFormats.js` Shared Utility

Created `frontend-react-js/src/lib/DateTimeFormats.js` with three exported functions that centralize all datetime formatting:

```javascript
import { DateTime } from 'luxon';

export function formatDateTime(value) {
  const created = DateTime.fromISO(value, { zone: 'utc' }).toLocal();
  return created.toFormat("LLL L");
}

export function timeAgo(value) {
  const created = DateTime.fromISO(value, { zone: 'utc' }).toLocal();
  const now = DateTime.now();
  const diff_mins = now.diff(created, 'minutes').toObject().minutes;
  const diff_hours = now.diff(created, 'hours').toObject().hours;

  if (diff_hours > 24.0) {
    return created.toFormat("LLL L");
  } else if (diff_hours > 1.0) {
    return `${Math.floor(diff_hours)}h ago`;
  } else if (diff_mins > 1.0) {
    return `${Math.round(diff_mins)}m ago`;
  } else {
    return 'now';
  }
}

export function formatTimeExpires(value) {
  const future = DateTime.fromISO(value, { zone: 'utc' }).toLocal();
  const now = DateTime.now();
  const diff_mins = future.diff(now, 'minutes').toObject().minutes;
  const diff_hours = future.diff(now, 'hours').toObject().hours;
  const diff_days = future.diff(now, 'days').toObject().days;

  if (diff_hours > 24.0) {
    return `${Math.floor(diff_days)}d`;
  } else if (diff_hours > 1.0) {
    return `${Math.floor(diff_hours)}h`;
  } else {
    return `${Math.round(diff_mins)}m`;
  }
}
```

The critical line in each function is:
```javascript
DateTime.fromISO(value, { zone: 'utc' }).toLocal()
```

This tells Luxon: "This timestamp IS UTC. Now convert it to whatever the user's browser timezone is." Without `{ zone: 'utc' }`, Luxon might assume local time, causing the mismatch.

### Component Refactoring

Refactored three React components to use the shared utility instead of duplicated inline functions:

**`ActivityContent.js`** — removed inline `format_time_created_at` and `format_time_expires_at` functions, replaced with:
```javascript
import { timeAgo, formatTimeExpires } from '../lib/DateTimeFormats';
```

**`MessageItem.js`** — removed inline `format_time_created_at`, replaced with:
```javascript
import { timeAgo } from '../lib/DateTimeFormats';
```

**`MessageGroupItem.js`** — same pattern as MessageItem:
```javascript
import { timeAgo } from '../lib/DateTimeFormats';
```

Each component's JSX was updated to call the new function names: `{timeAgo(props.activity.created_at)}` instead of `{format_time_created_at(props.activity.created_at)}`.

### Local Verification

Tested with `docker compose up`. Results:
- New crud post showed "now" for created_at and "7d" for expiration — both correct
- Messages showed "Mar 3" for timestamps older than 24 hours — correct
- React compiled successfully with no import errors
- No negative time values anywhere

---

## Phase 2 — CDK Serverless Image Processing Pipeline

### Architecture

```
User uploads avatar image
        ↓
S3 Bucket: assets.fentoncruddur.com
  └── avatars/original/image.jpg
        ↓ S3 Event Notification (OBJECT_CREATED_PUT)
Lambda Function (Node.js 20.x + sharp)
  ├── Reads original image from S3
  ├── Resizes to 512x512 using sharp (fit: cover, position: centre)
  └── Writes processed image to S3
        ↓
S3 Bucket: assets.fentoncruddur.com
  └── avatars/processed/image.jpg
        ↓ S3 Event Notification (OBJECT_CREATED_PUT)
SNS Topic: cruddur-assets
        ↓ (subscription disabled until API endpoint is deployed)
Webhook: https://api.fentoncruddur.com/webhooks/avatar
```

### CDK Project Setup

Created `thumbnail-serverless-cdk/` directory at the project root and initialized a TypeScript CDK application:

```bash
mkdir thumbnail-serverless-cdk
cd thumbnail-serverless-cdk
npm install aws-cdk -g
cdk init app --language typescript
npm install dotenv
```

The CDK init scaffolds the project structure: `lib/` for stack definitions, `bin/` for the CDK app entry point, `test/` for unit tests, plus TypeScript config and npm dependencies.

Created a `.env` file for environment-specific configuration:
```
THUMBING_BUCKET_NAME=assets.fentoncruddur.com
THUMBING_FUNCTION_PATH=/workspaces/aws-bootcamp-cruddur-2023/aws/lambdas/process-images
THUMBING_S3_FOLDER_INPUT=avatars/original
THUMBING_S3_FOLDER_OUTPUT=avatars/processed
THUMBING_WEBHOOK_URL=https://api.fentoncruddur.com/webhooks/avatar
THUMBING_TOPIC_NAME=cruddur-assets
```

The bucket name uses my domain (`assets.fentoncruddur.com`) — this is the professional convention for asset buckets and sets up for a future CloudFront distribution.

### CDK Stack — `thumbnail-serverless-cdk-stack.ts`

The stack is organized into dedicated methods for each resource, following the pattern Christy (the guest instructor and AWS Hero) recommended. Each method handles one resource type, keeping the constructor clean and the code readable:

**`createBucket()`** — S3 bucket with `DESTROY` removal policy (safe for a portfolio project — ensures `cdk destroy` cleans up completely)

**`createLambda()`** — Node.js 20.x Lambda function with environment variables for bucket name, input/output folders, and image dimensions. CDK automatically creates an IAM execution role with basic Lambda permissions.

**`createSnsTopic()`** — SNS topic for processing completion notifications

**`createS3NotifyToLambda()`** — Wires S3 `OBJECT_CREATED_PUT` events on the `avatars/original/` prefix to trigger the Lambda

**`createS3NotifyToSns()`** — Wires S3 `OBJECT_CREATED_PUT` events on the `avatars/processed/` prefix to publish to SNS

**`createPolicyBucketAccess()`** — Grants the Lambda `s3:GetObject` and `s3:PutObject` on the bucket. This is an explicit IAM policy — CDK's auto-generated execution role only covers CloudWatch Logs, not S3 access.

CDK L2 constructs handle the boilerplate: the Lambda execution role, the S3 bucket notification configuration Lambda (a CDK-managed custom resource), SNS topic policies allowing S3 to publish, and all the trust relationships between services. What would be 200+ lines of CloudFormation YAML is about 120 lines of TypeScript.

### Lambda Function — `aws/lambdas/process-images/index.js`

```javascript
const sharp = require('sharp');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
```

The function reads the source image from S3 (triggered by the event notification), uses `sharp` to resize it to 512x512 with `fit: 'cover'` (crops to fill the square, maintaining aspect ratio), and writes the result to the output folder.

**Why `sharp`?** It's lightweight, fast, and built on `libvips` (not ImageMagick). Andrew chose JavaScript specifically for this Lambda because `sharp` is the best image processing library for Lambda's size and execution time constraints.

**Why `@aws-sdk/client-s3`?** This is the AWS SDK v3 modular client — only imports the S3 module rather than the entire SDK, reducing the Lambda deployment package size.

### CDK Bootstrap and Deploy

Bootstrap (one-time per account per region):
```bash
cdk bootstrap "aws://931637612335/us-east-1"
```

This creates a `CDKToolkit` CloudFormation stack with an S3 staging bucket, IAM deployment roles, and an ECR repository that CDK uses to package and deploy assets.

First deploy attempt:
```bash
cdk deploy
```

This failed with `"Invalid parameter: Unreachable Endpoint"` on the SNS subscription. SNS tried to reach `https://api.fentoncruddur.com/webhooks/avatar` to confirm the HTTP subscription, but my ECS services were torn down. I commented out the subscription line and redeployed successfully.

**Lesson learned:** SNS HTTP/HTTPS subscriptions require the endpoint to be reachable at creation time. If your API isn't running, defer the subscription. The SNS topic itself deploys fine — only the subscription validation needs a live endpoint.

### Deployment Verification

Confirmed all resources were created:
```bash
aws s3 ls | grep assets
# 2026-03-24 23:28:18 assets.fentoncruddur.com

aws lambda list-functions --query "Functions[?starts_with(FunctionName, 'Thumbnail')].FunctionName"
# ThumbLambda5C775138-n4IzA1jkYE8d

aws sns list-topics --query "Topics[?contains(TopicArn, 'cruddur-assets')]"
# arn:aws:sns:us-east-1:931637612335:cruddur-assets
```

### End-to-End Pipeline Test

Uploaded a test image and verified the Lambda processed it:
```bash
aws s3 cp journal/assets/vh40t.jpg s3://assets.fentoncruddur.com/avatars/original/test-avatar.jpg
sleep 5
aws s3 ls s3://assets.fentoncruddur.com/avatars/processed/
# 2026-03-24 23:40:50   25958 test-avatar.jpg
```

The original image was uploaded to `avatars/original/`, the S3 event notification triggered the Lambda, `sharp` resized it to 512x512, and the processed image appeared in `avatars/processed/` — all within 5 seconds. The processed file is 25KB, compressed down from the original.

---

## Phase 3 — Portfolio Enhancements

### `bin/cdk/` Automation Scripts

Created three scripts following my established `bin/` pattern:

**`bin/cdk/deploy`** — runs `npm install` (ensures deps are present in fresh Codespaces) then `cdk deploy --require-approval never` (skips the interactive y/n prompt for automation)

**`bin/cdk/destroy`** — runs `cdk destroy --force` (skips confirmation prompt)

**`bin/cdk/synth`** — runs `cdk synth` to generate and preview the CloudFormation template without deploying

Each script resolves its own path to the CDK directory using the same `readlink -f` pattern used by my other automation scripts, so they work regardless of which directory you run them from.

Tested `./bin/cdk/deploy` — ran npm install, synthesized the template, and updated the stack in 27 seconds.

### Node.js 20.x Lambda Runtime Upgrade

Updated the Lambda runtime from Node.js 18.x (end-of-life) to Node.js 20.x (current LTS):

```typescript
// Before
runtime: lambda.Runtime.NODEJS_18_X,

// After
runtime: lambda.Runtime.NODEJS_20_X,
```

The Lambda function code is plain JavaScript with no Node 18-specific APIs, so it works on 20 without changes. Deployed the update using `./bin/cdk/deploy` — the Lambda runtime was updated in-place with no downtime or data loss.

---

## How CDK Works (Key Concepts)

**CDK (Cloud Development Kit)** lets you define AWS infrastructure in a programming language (TypeScript, Python, Java, etc.) instead of writing CloudFormation JSON/YAML. CDK *generates* CloudFormation under the hood — your TypeScript code synthesizes into a CloudFormation template that AWS deploys.

**L1 vs L2 constructs:** L1 constructs (prefixed with `Cfn`, like `CfnBucket`) map 1:1 to CloudFormation resources. L2 constructs (like `s3.Bucket`, `lambda.Function`) add intelligent defaults, automatic IAM policies, and cross-resource wiring. This stack uses L2 constructs exclusively — they handle most of the IAM boilerplate automatically.

**`cdk synth`** generates the CloudFormation template locally without deploying. It's the equivalent of a dry run — useful for catching errors and reviewing what resources will be created.

**`cdk bootstrap`** is a one-time setup per AWS account per region. It creates staging infrastructure (S3 bucket, IAM roles, ECR repo) that CDK needs to package and deploy your assets.

**`cdk deploy`** synthesizes the template, uploads assets (like Lambda code) to the staging bucket, then creates/updates the CloudFormation stack. It shows a diff of IAM changes and asks for confirmation before proceeding.

**`cdk destroy`** deletes the CloudFormation stack and all resources it created. Resources with `RemovalPolicy.DESTROY` are deleted entirely; resources with `RETAIN` (the default) are kept as orphans.

---

## Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| S3 bucket named `assets.fentoncruddur.com` | Professional convention — ties to domain, enables future CloudFront distribution |
| Lambda runtime Node.js 20.x | Current LTS, Node 18 is end-of-life |
| `sharp` for image processing | Lightweight, fast, built on libvips — ideal for Lambda's size/time constraints |
| `@aws-sdk/client-s3` (SDK v3) | Modular import — only S3 client, not entire SDK — reduces deployment package size |
| SNS subscription commented out | Webhook endpoint requires running API; enable when ECS services are deployed |
| `DESTROY` removal policy on S3 bucket | Portfolio project — `cdk destroy` should clean up completely |
| Separate CDK directory (`thumbnail-serverless-cdk/`) | Keeps CDK dependencies isolated from the main application |
| UTC everywhere, local at display only | Eliminates timezone inconsistencies across backend, database, and multiple frontends |
| `envsubst` pattern for CDK `.env` | Consistent with the Week 7 environment variable template approach |

---

## Files Created

**Phase 1 — Timezone Fixes:**
- `frontend-react-js/src/lib/DateTimeFormats.js` — shared datetime utility with UTC→local conversion

**Phase 2 — CDK Stack and Lambda:**
- `thumbnail-serverless-cdk/` — entire CDK project directory (initialized with `cdk init`)
- `thumbnail-serverless-cdk/lib/thumbnail-serverless-cdk-stack.ts` — CDK stack defining S3, Lambda, SNS, event notifications, IAM
- `thumbnail-serverless-cdk/.env` — environment variables for the CDK stack
- `aws/lambdas/process-images/index.js` — Lambda function code (sharp image processing)
- `aws/lambdas/process-images/package.json` — Lambda Node.js dependencies
- `aws/lambdas/process-images/.gitignore` — excludes node_modules from git

**Phase 3 — Automation:**
- `bin/cdk/deploy` — CDK deploy automation script
- `bin/cdk/destroy` — CDK destroy automation script
- `bin/cdk/synth` — CDK synth automation script

## Files Modified

- `backend-flask/lib/ddb.py` — simplified datetime to `datetime.now(timezone.utc).isoformat()`
- `backend-flask/bin/ddb/seed` — removed ZoneInfo, offset seed data by 1 day into past
- `frontend-react-js/src/components/ActivityContent.js` — replaced inline datetime functions with shared utility imports
- `frontend-react-js/src/components/MessageItem.js` — same refactor
- `frontend-react-js/src/components/MessageGroupItem.js` — same refactor

---

## AWS Resources Created by CDK

| Resource | Type | Name/Identifier |
|----------|------|-----------------|
| S3 Bucket | `AWS::S3::Bucket` | `assets.fentoncruddur.com` |
| Lambda Function | `AWS::Lambda::Function` | `ThumbLambda` (Node.js 20.x) |
| Lambda Execution Role | `AWS::IAM::Role` | Auto-generated by CDK with basic execution + S3 read/write |
| SNS Topic | `AWS::SNS::Topic` | `cruddur-assets` |
| S3 → Lambda Notification | `AWS::S3::BucketNotification` | Triggers on `avatars/original/*` PUT events |
| S3 → SNS Notification | `AWS::S3::BucketNotification` | Triggers on `avatars/processed/*` PUT events |
| CDK Toolkit Stack | `AWS::CloudFormation::Stack` | `CDKToolkit` (bootstrap — S3 staging, IAM roles) |

**Cost note:** Lambda, SNS, and a nearly-empty S3 bucket have effectively zero cost when idle. Unlike ECS/Fargate, there is no urgency to tear down these resources between sessions.

---

## Commands Reference

```bash
# CDK lifecycle (from repo root)
./bin/cdk/synth      # preview CloudFormation template
./bin/cdk/deploy     # deploy/update the stack
./bin/cdk/destroy    # tear down all CDK resources

# CDK bootstrap (one-time per account per region)
cdk bootstrap "aws://931637612335/us-east-1"

# Test the image processing pipeline
aws s3 cp path/to/image.jpg s3://assets.fentoncruddur.com/avatars/original/test.jpg
sleep 5
aws s3 ls s3://assets.fentoncruddur.com/avatars/processed/

# Verify deployed resources
aws s3 ls | grep assets
aws lambda list-functions --query "Functions[?starts_with(FunctionName, 'Thumbnail')].FunctionName"
aws sns list-topics --query "Topics[?contains(TopicArn, 'cruddur-assets')]"

# Check Lambda logs after a test upload
aws logs tail /aws/lambda/FUNCTION_NAME --since 5m --format short

# Delete a failed CloudFormation stack (if deploy fails mid-creation)
aws cloudformation delete-stack --stack-name ThumbnailServerlessCdkStack
```

---

## Progress Checklist

- [x] Fix UTC datetime generation in `ddb.py` (both `create_message` and `create_message_group`)
- [x] Fix DDB seed script — remove ZoneInfo, offset by 1 day
- [x] Create `DateTimeFormats.js` shared utility with `fromISO(value, {zone: 'utc'}).toLocal()` pattern
- [x] Refactor `ActivityContent.js` to use shared utility
- [x] Refactor `MessageItem.js` to use shared utility
- [x] Refactor `MessageGroupItem.js` to use shared utility
- [x] Verify timezone fixes locally with `docker compose up`
- [x] Initialize CDK TypeScript project
- [x] Define S3 bucket in CDK stack
- [x] Write Lambda function code with `sharp` image processing
- [x] Define Lambda function in CDK stack
- [x] Create SNS topic in CDK stack
- [x] Wire S3 event notifications (original → Lambda, processed → SNS)
- [x] Configure IAM policies for Lambda S3 access
- [x] CDK Bootstrap AWS account for `us-east-1`
- [x] CDK Deploy — stack created successfully
- [x] End-to-end test — uploaded image processed and appeared in output folder
- [x] Create `bin/cdk/deploy`, `bin/cdk/destroy`, `bin/cdk/synth` automation scripts
- [x] Upgrade Lambda runtime to Node.js 20.x
- [x] Redeploy with `./bin/cdk/deploy` — confirmed working
- [ ] Enable SNS webhook subscription (requires running API endpoint)