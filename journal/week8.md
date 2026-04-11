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

---

## Phase 4 — Avatar Upload Pipeline, API Gateway, and Dynamic Avatar Rendering

**Date:** April 9–11, 2026

### Overview

This phase completed the client-side avatar upload flow using presigned URLs, API Gateway, a JWT Lambda authorizer, and dynamic avatar rendering using Cognito user UUIDs across all frontend components. It also included a `ProfileAvatar` component refactor and several debugging sessions that produced valuable lessons about AWS infrastructure, Docker volume mounts, and CloudFront caching.

---

### Architecture: Presigned URL Upload Pipeline

This pattern is production-standard for three reasons:
- Files never pass through your application servers — direct browser-to-S3
- Presigned URLs expire (300 seconds) — least privilege by design
- Lambda authorizer validates JWT before issuing the URL — auth at the edge

---

### Lambda 1 — CruddurAvatarUpload (Ruby 3.4)

Located at `aws/lambdas/cruddur-upload-avatar/function.rb`.

Key implementation decisions:
- Uses `aws-sdk-s3` (pre-installed on Lambda runtime — no packaging needed)
- `jwt` and `ox` gems packaged as a Lambda Layer (`ruby-jwt`, version 1, 1.67 MB)
- CORS origin read from `FRONTEND_URL` environment variable — not hardcoded
- Object key includes `avatars/original/` prefix to match ThumbLambda's S3 trigger filter
- Presigned URL uses PUT method with 300-second expiry

**Why Ruby?** Lambda is runtime-agnostic. In production, teams standardize on one language to reduce operational overhead. For this portfolio project, Ruby demonstrates polyglot capability — a valid talking point in interviews.

**Deployment note:** `bundle install` failed in Codespaces due to native extension compilation errors for `aws-eventstream`. Solution: since AWS SDK is pre-installed on the Lambda runtime, only `jwt` and `ox` needed packaging. Built the Layer in `/tmp` to avoid workspace pollution.

---

### Lambda 2 — CruddurApiGatewayLambdaAuthorizer (Node.js 24.x)

Located at `aws/lambdas/lambda-authorizer/index.js`.

Key implementation decisions:
- Uses `aws-jwt-verify` library for Cognito JWT validation
- Verifier instantiated **outside** the handler — cold start optimization (verifier is reused across warm invocations)
- Returns `{ isAuthorized: true/false }` — Simple response mode for HTTP API
- Strips `Bearer ` prefix before passing token to verifier (bug found during testing)
- Identity source: `$request.header.Authorization`

---

### API Gateway Configuration

Created HTTP API named `api.fentoncruddur.com` (invoke URL: `https://rtvb6kbife.execute-api.us-east-1.amazonaws.com`).

| Route | Integration | Authorizer |
|-------|-------------|------------|
| POST /avatars/key_upload | CruddurAvatarUpload | CruddurJWTAuthorizer |
| OPTIONS /{proxy+} | CruddurAvatarUpload | None |

**Why OPTIONS has no authorizer:** CORS preflight requests don't carry Authorization headers — browsers send OPTIONS first to check if the request is allowed. Attaching an authorizer to OPTIONS would cause all uploads to fail before they start.

---

### S3 CORS Policy

Added to `fentoncruddur-uploaded-avatars` bucket:
- `AllowedOrigins`: Codespace URL (dev) / `https://fentoncruddur.com` (prod)
- `AllowedMethods`: PUT only

The browser does a CORS preflight directly against S3 when uploading via presigned URL — API Gateway CORS config doesn't cover this. Both layers need CORS configured independently.

---

### Frontend Integration

**`ProfileForm.js`** — Two new functions:
- `s3_upload_key`: calls API Gateway POST to get presigned URL (requires JWT in Authorization header)
- `s3_upload`: PUTs file directly to S3 using presigned URL (plain `fetch`, no AWS SDK needed)
- After successful upload: stores timestamp in `localStorage`, triggers `window.location.reload()` after 5-second delay (gives ThumbLambda time to process)

**Environment variable:** `REACT_APP_API_GATEWAY_ENDPOINT_URL` added to `.env.template`, `.env`, and `docker-compose.yml`.

---

### CloudFront Caching Fix

**Problem:** After uploading a new avatar, CloudFront served the cached old image because the filename never changes (UUID-based).

**Solution:** Created a new CloudFront behavior specifically for `/avatars/processed/*`:

| Setting | Value |
|---------|-------|
| Path pattern | `/avatars/processed/*` |
| Cache policy | `CachingDisabled` |
| Origin request policy | `CORS-S3Origin` |
| Response headers policy | `SimpleCORS` |

The default behavior (`*`) retains `CachingOptimized` for all other assets (CSS, JS, banner). Only avatar images bypass cache.

Additionally added `?v=${Date.now()}` to all avatar `<img>` src URLs — ensures each page load generates a unique URL as a secondary cache-busting layer.

---

### ProfileAvatar Component Refactor

Extracted avatar rendering into a reusable component following Andrew's pattern from the "Render Avatar from CloudFront" video.

**Created:**
- `frontend-react-js/src/components/ProfileAvatar.js` — accepts single `id` prop (Cognito UUID), constructs CloudFront URL internally
- `frontend-react-js/src/components/ProfileAvatar.css` — shared base styles (`border-radius: 999px`, `object-fit: cover`)

**Updated to use ProfileAvatar:**
- `ProfileInfo.js` — nav sidebar avatar
- `ProfileHeading.js` — profile page large avatar
- `ActivityContent.js` — activity feed avatar

**Why this matters:** Avatar rendering logic now lives in one place. If the URL pattern, fallback behavior, or loading state ever changes, it's a single-file edit.

---

### SQL Fixes

Added `users.handle` to two SQL queries that were missing it:

**`backend-flask/db/sql/activities/home.sql`** — handle missing, causing `@` to render alone in activity feed items.

**`backend-flask/db/sql/users/show.sql`** — handle missing from the **inner** activities SELECT (the nested subquery). The outer profile SELECT already had it, but the activities array didn't.

---

### Debugging Case Study: Docker Volume Mount Caching

**Problem:** Updated `show.sql` was not being picked up by the running container despite saving the file and restarting the container multiple times.

**Root cause:** In GitHub Codespaces (remote Docker host), the volume mount layer caches file inodes. `docker compose restart` and `stop/up` reuse the existing container filesystem layer, so the cache persisted across restarts.

**Diagnostic steps taken:**
1. `docker exec ... cat /backend-flask/db/sql/users/show.sql` — confirmed container had old version
2. `docker compose rm -sf backend-flask && docker compose up backend-flask -d` — full container removal and recreation — still didn't fix it
3. `docker cp backend-flask/db/sql/users/show.sql <container>:/backend-flask/db/sql/users/show.sql` — directly copied file bytes into container bypassing mount — **this worked**

**Production equivalent:** Config file changes not taking effect after container restart. Enterprise solution: bake SQL/config files into the Docker image at build time using `COPY` in the Dockerfile rather than volume mounts. That way files are always part of the immutable image layer.

**Interview answer:** "I hit a Docker volume mount caching issue in a cloud-based dev environment where the container was serving stale SQL files despite the source being updated. I diagnosed it by exec-ing into the container and comparing the actual file contents, then resolved it by directly copying the file into the container with `docker cp`. In production I'd prevent this entirely by baking config files into the image rather than relying on volume mounts."

---

### Bugs Found and Fixed

| Bug | Root Cause | Fix |
|-----|------------|-----|
| CORS error on avatar upload | Lambda CORS origin hardcoded to Gitpod URL | Refactored to use `FRONTEND_URL` env var |
| 403 on POST /avatars/key_upload | Authorizer passed full `Bearer token` string to jwt-verify | Added `.split(' ')[1]` to strip prefix |
| ThumbLambda never triggered | Ruby Lambda uploaded to S3 root, not `avatars/original/` prefix | Updated `object_key` to include prefix |
| Avatar not updating after upload | CloudFront edge cache serving old image | Added `CachingDisabled` behavior + `?v=timestamp` |
| `@` symbol alone in activity feed | `users.handle` missing from SQL SELECT | Added to both `home.sql` and `show.sql` inner SELECT |
| Duplicate Save button | Copy-paste error in ProfileForm.js | Removed duplicate div |
| Avatar overlapping profile name | `padding-top` too small on `.info` | Increased to `90px` in ProfileHeading.css |
| Lambda env vars swapped | Manual entry error in AWS Console | Corrected `FRONTEND_URL` and `UPLOADS_BUCKET_NAME` |

---

### Key Learnings

1. **S3 trigger prefix filters must match upload path exactly** — uploading to bucket root won't trigger a Lambda filtering on `avatars/original/`
2. **API Gateway HTTP API requires manual OPTIONS route** — unlike REST API which has a CORS checkbox
3. **Presigned URLs use PUT not POST** — using POST returns 403
4. **S3 needs its own CORS policy** — browser does preflight directly against S3, not through API Gateway
5. **Frontend doesn't need AWS SDK for presigned URL uploads** — plain `fetch` with PUT method works
6. **Container restart ≠ file change pickup in remote Docker** — `docker cp` is the reliable fix; production solution is baking files into the image
7. **CloudFront CachingDisabled on specific paths** — create a targeted behavior rather than disabling cache globally
8. **Lambda Layers for gems** — when native extension compilation fails in dev environment, package only the gems that need packaging (AWS SDK is pre-installed)

---

### AWS Resources Created

| Resource | Type | Details |
|----------|------|---------|
| CruddurAvatarUpload | Lambda (Ruby 3.4) | Presigned URL generation |
| CruddurApiGatewayLambdaAuthorizer | Lambda (Node.js 24.x) | JWT verification |
| ruby-jwt | Lambda Layer | jwt + ox gems, Ruby 3.4 compatible |
| api.fentoncruddur.com | API Gateway HTTP API | ID: rtvb6kbife |
| CruddurJWTAuthorizer | API Gateway Authorizer | Simple response mode |
| /avatars/processed/* behavior | CloudFront Behavior | CachingDisabled |

---

### Progress Checklist — Phase 4

- [x] Create Ruby presigned URL Lambda with JWT decoding and S3 presigned URL generation
- [x] Package jwt/ox gems as Lambda Layer (ruby-jwt)
- [x] Deploy CruddurAvatarUpload to AWS Console
- [x] Create Node.js JWT authorizer Lambda
- [x] Deploy CruddurApiGatewayLambdaAuthorizer to AWS Console
- [x] Create API Gateway HTTP API with POST and OPTIONS routes
- [x] Configure JWT authorizer on POST route only
- [x] Add S3 CORS policy to uploads bucket
- [x] Add REACT_APP_API_GATEWAY_ENDPOINT_URL to frontend env
- [x] Implement s3_upload_key and s3_upload functions in ProfileForm.js
- [x] Confirm end-to-end upload pipeline working (Network tab verification)
- [x] Fix ThumbLambda trigger (avatars/original/ prefix)
- [x] Add CloudFront CachingDisabled behavior for /avatars/processed/*
- [x] Add cache-busting ?v=timestamp to avatar URLs
- [x] Add cognito_user_id to show.sql and home.sql
- [x] Implement dynamic avatar paths across all three components
- [x] Refactor to ProfileAvatar reusable component
- [x] Fix users.handle missing from SQL queries
- [x] Resolve Docker volume mount caching issue with docker cp
- [x] Commit all changes