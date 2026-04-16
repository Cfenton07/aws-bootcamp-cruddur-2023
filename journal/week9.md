# Week 9 — CI/CD Pipeline with AWS CodePipeline, CodeBuild, and ECS Fargate

**Date:** April 14–16, 2026
**Bootcamp Video:** Week 9 - CI/CD Pipeline

---

## Overview

This week I built an automated CI/CD (Continuous Integration / Continuous Deployment) pipeline for the Cruddur backend service. Before this work, every production deployment required a manual sequence of commands: logging into ECR, building the Docker image, pushing it, and forcing an ECS service update. That process was error-prone, time-consuming, and impossible to scale.

After this week, deploying to production is a single git operation — merging code into the `prod` branch. The pipeline handles everything else automatically: detecting the change, building and tagging a new Docker image, pushing it to ECR, and rolling it out to ECS Fargate with zero downtime.

This is one of the most practically valuable skills I've built in the bootcamp. In every professional cloud engineering role, CI/CD is table stakes. Having built one from scratch — including debugging IAM permissions, artifact contracts, and production database issues — gives me a concrete, real-world example to discuss in interviews.

---

## Architectural Purpose

### The Problem Before This Week

Every time I made a code change, deploying it looked like this:

```
Manual process (before CI/CD):
1. aws ecr get-login-password | docker login ...
2. docker build -t backend-flask .
3. docker push ECR_URL/backend-flask:latest
4. aws ecs update-service --force-new-deployment
5. Wait and watch ECS for health check pass
```

This required me to be at my computer, run multiple commands, and monitor the deployment manually. It was fragile and not how real engineering teams operate.

### The Solution: An Automated Pipeline

```
Automated process (after CI/CD):
Developer merges PR into prod branch → done.

Pipeline handles:
GitHub (prod branch) → CodePipeline → CodeBuild → ECR → ECS Fargate
```

### Full Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  DEVELOPER WORKFLOW                                             │
│                                                                 │
│  git commit → git push (main) → merge PR into prod             │
└──────────────────────────┬──────────────────────────────────────┘
                           │ PR merge triggers webhook
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  AWS CODEPIPELINE (cruddur-backend-flask)                       │
│                                                                 │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                  │
│  │ SOURCE   │ →  │  BUILD   │ →  │  DEPLOY  │                  │
│  │          │    │          │    │          │                  │
│  │ GitHub   │    │CodeBuild │    │ Amazon   │                  │
│  │ prod     │    │ bake-    │    │ ECS      │                  │
│  │ branch   │    │ image    │    │ Fargate  │                  │
│  └──────────┘    └──────────┘    └──────────┘                  │
│                       │                │                        │
│                   Builds Docker    Uses imagedefs.json          │
│                   image, pushes    to update service            │
│                   to ECR           rolling deploy               │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  RESULT: New container live in production                       │
│  Zero manual steps. Zero downtime rolling deployment.           │
└─────────────────────────────────────────────────────────────────┘
```

### The Three Pipeline Stages Explained

**Stage 1 — Source**
CodePipeline connects to GitHub using AWS CodeConnections (a managed GitHub App). It watches the `prod` branch for pull request merge events. When a merge is detected, it downloads the repository as a zip artifact and stores it in S3. This S3 artifact becomes the input for the Build stage.

**Stage 2 — Build (the "bake image" stage)**
AWS CodeBuild picks up the S3 artifact, spins up a managed build container running Amazon Linux, and executes the instructions in `backend-flask/buildspec.yml`. The build:
- Logs into ECR using temporary IAM credentials
- Runs `docker build` on the backend-flask source
- Tags the image with both `latest` and the Git commit SHA
- Pushes both tags to ECR
- Writes `imagedefinitions.json` — a small JSON file that tells ECS exactly which image to deploy

**Stage 3 — Deploy**
CodePipeline passes the `imagedefinitions.json` artifact to the ECS deploy action. ECS reads the file, registers a new task definition revision with the updated image URI, and performs a rolling deployment — spinning up new containers, waiting for health checks to pass, then draining and terminating the old containers.

---

## Key Files Created

### `backend-flask/buildspec.yml`

This is the instruction set for AWS CodeBuild. It lives inside the `backend-flask/` directory because this is a monorepo — one repository housing both frontend and backend services. Each service owns its own build instructions.

```yaml
version: 0.2

phases:
  pre_build:
    commands:
      - echo "== Logging into ECR =="
      - aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com
      - REPO_URL=$AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/backend-flask
      - IMAGE_TAG=$CODEBUILD_RESOLVED_SOURCE_VERSION
  build:
    commands:
      - echo "== Building Docker image =="
      - cd $CODEBUILD_SRC_DIR/backend-flask
      - docker build -t $REPO_URL:$IMAGE_TAG -t $REPO_URL:latest .
  post_build:
    commands:
      - echo "== Pushing image to ECR =="
      - docker push $REPO_URL:$IMAGE_TAG
      - docker push $REPO_URL:latest
      - echo "== Writing imagedefinitions.json =="
      - cd $CODEBUILD_SRC_DIR
      - printf '[{"name":"backend-flask","imageUri":"%s"}]' $REPO_URL:$IMAGE_TAG > imagedefinitions.json

artifacts:
  files:
    - imagedefinitions.json

logs:
  cloudwatch:
    group-name: /cruddur/codebuild
    stream-name: backend-flask
```

**Why no hardcoded values?** Every sensitive or environment-specific value uses environment variables. `$AWS_ACCOUNT_ID` and `$AWS_DEFAULT_REGION` are supplied by the CodeBuild project configuration — not baked into the file. This makes the buildspec portable across accounts and regions, and prevents accidental credential exposure in version control.

**Why tag with `$CODEBUILD_RESOLVED_SOURCE_VERSION`?** This is a built-in CodeBuild variable that resolves to the exact Git commit SHA that triggered the build. Every Docker image in ECR is permanently traceable back to the exact line of code that produced it. This is non-negotiable in production — if a deployment causes a regression at 2am, you need to know exactly which commit introduced it and roll back in seconds.

### The `imagedefinitions.json` Contract

This file is the critical handoff between the Build stage and the Deploy stage:

```json
[{"name":"backend-flask","imageUri":"931637612335.dkr.ecr.us-east-1.amazonaws.com/backend-flask:abc1234def"}]
```

The `name` field must exactly match the container name in the ECS task definition. The `imageUri` points to the specific SHA-tagged image in ECR. CodePipeline passes this file as an artifact from Build to Deploy, and ECS uses it to know which image to pull.

Without this file, the Deploy stage fails immediately with "did not find the image definition file" — which is exactly what happened on the first pipeline run before the `buildspec.yml` was in the `prod` branch.

---

## AWS Resources Created

| Resource | Name | Purpose |
|---|---|---|
| CodeBuild Project | `cruddur-backend-flask-bake-image` | Builds and pushes Docker image on each pipeline execution |
| CodePipeline | `cruddur-backend-flask` | Orchestrates the full Source → Build → Deploy workflow |
| IAM Inline Policy | `CruddurCodeBuildECRPolicy` | Grants CodeBuild role permission to push images to ECR |
| IAM Inline Policy | `CruddurCodePipelineECSPolicy` | Grants CodePipeline role permission to deploy to ECS |
| GitHub Branch | `prod` | Production deployment gate — merging here triggers the pipeline |
| CodeConnections | `cruddur` | AWS-managed GitHub App connection for webhook-based triggering |
| CloudWatch Log Group | `/cruddur/codebuild` | Stores all CodeBuild execution logs for debugging |

---

## IAM Policies — Why Both Were Needed

This is one of the most important lessons from this week: AWS services don't automatically trust each other. Every cross-service action requires explicit permission grants.

### CruddurCodeBuildECRPolicy (attached to CodeBuild role)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchGetImage",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchCheckLayerAvailability",
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload"
      ],
      "Resource": "*"
    }
  ]
}
```

Why `Resource: "*"` for `GetAuthorizationToken`? This is a known AWS limitation — the ECR authorization token action operates at the account level, not the repository level, and does not support resource-level restrictions. All other ECR actions could theoretically be scoped to the specific repository ARN for tighter least-privilege control.

### CruddurCodePipelineECSPolicy (attached to CodePipeline role)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecs:DescribeServices",
        "ecs:DescribeTaskDefinition",
        "ecs:DescribeTasks",
        "ecs:ListTasks",
        "ecs:RegisterTaskDefinition",
        "ecs:UpdateService"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "*"
    }
  ]
}
```

The `iam:PassRole` permission deserves explanation. When CodePipeline registers a new ECS task definition, it passes an IAM execution role to ECS (the role that allows ECS to pull from ECR and write to CloudWatch Logs). AWS requires explicit `PassRole` permission for this cross-service role handoff — without it, the deploy fails with "insufficient permissions to access ECS" even if all the ECS permissions are in place.

---

## Branch Strategy

### Why a Separate `prod` Branch?

The `prod` branch acts as a deployment gate. Code never gets committed directly to `prod`. The only way code enters `prod` is through a deliberate pull request merge from `main`.

```
main branch  →  development, daily commits, feature work
     ↓
  PR merge
     ↓
prod branch  →  triggers CI/CD pipeline → production ECS deployment
```

This pattern gives me a manual checkpoint before every production deployment. In more mature setups, a manual approval stage would be added inside CodePipeline between Build and Deploy — requiring a human to review the build before ECS rolls it out. For Cruddur this is not yet implemented, but it is the standard enterprise pattern.

---

## Debugging Sessions

### Issue 1 — buildspec.yml Not Found on First Run

**Symptom:** `YAML_FILE_ERROR: stat .../backend-flask/buildspec.yml: no such file or directory`

**Root Cause:** The `prod` branch was created before `buildspec.yml` was committed. The pipeline pulls from `prod`, so it had no knowledge of the new file on `main`.

**Fix:** Merge `main` into `prod` to bring the new file into the production branch.

```bash
git checkout prod
git merge main
git push origin prod
git checkout main
```

**Lesson:** The pipeline is only as current as what's in the `prod` branch. New files must be merged to `prod` before the pipeline can use them.

### Issue 2 — Insufficient Permissions on First Deploy

**Symptom:** `The provided role does not have sufficient permissions to access ECS`

**Root Cause:** The auto-generated CodePipeline service role had no ECS permissions. AWS creates a minimal role by default — it doesn't assume you need every service permission.

**Fix:** Attach `CruddurCodePipelineECSPolicy` as an inline policy on the CodePipeline service role.

**Lesson:** Always audit the IAM role created for managed services. Default roles are intentionally minimal. Adding permissions incrementally as failures reveal them is a valid approach, but understanding the required permission set upfront is better.

### Issue 3 — ECS Service Doesn't Exist

**Symptom:** `The Amazon ECS service 'backend-flask' does not exist`

**Root Cause:** In the bootcamp, ECS services are torn down between sessions to save costs. CodePipeline expects an existing service to deploy to — it cannot create services from scratch.

**Fix:** Run the backend deployment script to recreate the ECS service before triggering the pipeline.

```bash
./bin/ecs/deploy-backend
```

**Lesson:** In production, services run continuously and this issue never arises. In development environments where resources are stopped to manage costs, the deployment sequence must include ensuring the target service exists before the pipeline runs.

### Issue 4 — Production Database Missing the `bio` Column

**Symptom:** Profile page returning 500 error: `psycopg.errors.UndefinedColumn: column users.bio does not exist`

**Root Cause:** The `add_bio_column` migration had only been run in the local Codespace development database — never against the production RDS instance. The `show.sql` query references `users.bio`, which caused every profile page load to crash.

**Fix:** Run the migration system against the production database using the production connection URL retrieved from SSM Parameter Store.

```bash
export PROD_CONNECTION_URL=$(aws ssm get-parameter \
  --name /cruddur/backend-flask/CONNECTION_URL \
  --with-decryption \
  --query "Parameter.Value" \
  --output text)

CONNECTION_URL=$PROD_CONNECTION_URL ./bin/db/migrate
```

**Lesson:** Development and production databases must stay in sync. Every schema migration run locally must also be applied to production. This is why migration systems exist — to track exactly which changes have been applied to each environment. The `schema_information` table records each migration's timestamp and status.

### Issue 5 — Running `schema-load` Wiped Production Data

**Symptom:** After running `schema-load prod`, all user data disappeared from production.

**Root Cause:** `schema-load` contains `DROP TABLE` statements — it rebuilds the database from scratch. It is designed for initial setup only and is destructive by definition.

**Fix:** Ran `seed` and `update_cognito_user_ids` to restore the base dataset.

```bash
CONNECTION_URL=$PROD_CONNECTION_URL ./bin/db/seed
CONNECTION_URL=$PROD_CONNECTION_URL ./bin/db/update_cognito_user_ids
```

**Critical Lesson — Schema-load vs Migrate:**

| Command | When to Use | Effect |
|---|---|---|
| `bin/db/schema-load` | Initial database setup ONLY | Drops and recreates all tables — DESTRUCTIVE |
| `bin/db/migrate` | All subsequent schema changes | Adds columns/tables incrementally — SAFE |

After initial setup, `schema-load` should never be run against a production database again. All future changes go through the migration system. This is the entire purpose of having a migration system — to make schema changes safely without data loss.

---

## End-to-End Pipeline Verification

To prove the pipeline works, I made a small code change to `backend-flask/app.py`, committed it to `main`, and merged to `prod`:

**Code change:**
```python
# Before
@app.route('/api/health-check')
def health_check():
  return {'success': True}, 200

# After
@app.route('/api/health-check')
def health_check():
  return {'success': True, 'version': 1}, 200
```

**Pipeline execution:**
```
Source  →  Build     →  Deploy
  ✅         ✅           ✅
4 min ago  3 min ago   just now
```

**Verification:**
```
https://api.fentoncruddur.com/api/health-check

{
  "success": true,
  "version": 1
}
```

The new `"version": 1` field confirmed that the pipeline had built and deployed the new code — zero manual steps, zero downtime.

---

## Key Learnings

**1. Infrastructure problems masquerade as application problems**
The first instinct when a deployment fails is to look at application code. This week reinforced the lesson from the CORS debugging case study: always check the infrastructure layer first. IAM permission errors, missing services, and network configuration issues cause failures that look like application bugs from the outside.

**2. Every AWS service operates with least-privilege IAM by default**
No AWS service automatically trusts another. CodeBuild needed explicit ECR push permissions. CodePipeline needed explicit ECS deploy permissions and `iam:PassRole`. Understanding the required IAM permission set for any AWS workflow is a foundational cloud engineering skill.

**3. Development and production environments must stay in sync**
Database migrations, environment variables, configuration files — anything that differs between development and production is a source of production bugs. The `bio` column existed in development for weeks before production was brought up and immediately crashed. Treating production database migrations with the same discipline as code deployments is non-negotiable.

**4. The `prod` branch pattern is a fundamental DevOps concept**
Separating the "work branch" (main) from the "deployment branch" (prod) creates a deliberate gate before production changes. This is the foundation of GitOps — using git operations as the source of truth for production state.

**5. Docker image tagging with commit SHAs is production-standard**
Every image in ECR is tagged with the exact Git commit that produced it. If a deployment introduces a regression, I can immediately identify which commit caused it and roll back to the previous SHA-tagged image without rebuilding.

**6. `schema-load` is for initial setup only — `migrate` is for everything after**
Running `schema-load` on a live production database drops all tables and wipes all data. This is the correct behavior for initial setup. After that, all schema changes must go through the incremental migration system. This distinction is critical for anyone managing production databases.

---

## Interview-Ready Summary

> *"I built a CI/CD pipeline on AWS using CodePipeline, CodeBuild, and ECS Fargate. The pipeline triggers automatically on a pull request merge to a dedicated production branch. CodeBuild executes a buildspec.yml file that logs into ECR, builds a Docker image tagged with the Git commit SHA for traceability, pushes the image, and writes an imagedefinitions.json artifact. CodePipeline passes that artifact to the ECS deploy stage, which performs a rolling deployment with zero downtime. I configured two IAM inline policies — one granting the CodeBuild role ECR push permissions, and one granting the CodePipeline role ECS deploy and PassRole permissions. I also managed a production database migration incident, applying an incremental schema migration against the live RDS instance using the project's migration system and SSM Parameter Store for credential retrieval."*

---

## AWS Resources Summary

| Service | Resource | Region |
|---|---|---|
| CodePipeline | `cruddur-backend-flask` | us-east-1 |
| CodeBuild | `cruddur-backend-flask-bake-image` | us-east-1 |
| ECR | `backend-flask` | us-east-1 |
| ECS Cluster | `cruddur` | us-east-1 |
| ECS Service | `backend-flask` | us-east-1 |
| RDS | `cruddur-db-instance` | us-east-1 |
| CloudWatch Logs | `/cruddur/codebuild` | us-east-1 |
| S3 | CodePipeline artifact bucket (auto-created) | us-east-1 |

---

## Files Modified This Week

| File | Change |
|---|---|
| `backend-flask/buildspec.yml` | Created — CodeBuild instruction set for building and pushing the Docker image |
| `backend-flask/app.py` | Added `"version": 1` to health check response for end-to-end pipeline verification |

---

## Commands Reference

```bash
# Create and push the prod branch
git checkout -b prod
git push -u origin prod
git checkout main

# Merge main into prod to trigger the pipeline
git checkout prod
git merge main
git push origin prod
git checkout main

# Check RDS instance status
aws rds describe-db-instances \
  --db-instance-identifier cruddur-db-instance \
  --query "DBInstances[0].DBInstanceStatus" \
  --output text

# Start RDS instance
aws rds start-db-instance --db-instance-identifier cruddur-db-instance

# Stop RDS instance
aws rds stop-db-instance --db-instance-identifier cruddur-db-instance

# Retrieve production connection URL from SSM
export PROD_CONNECTION_URL=$(aws ssm get-parameter \
  --name /cruddur/backend-flask/CONNECTION_URL \
  --with-decryption \
  --query "Parameter.Value" \
  --output text)

# Run migrations against production database
CONNECTION_URL=$PROD_CONNECTION_URL ./bin/db/migrate

# Seed production database (after schema-load reset)
CONNECTION_URL=$PROD_CONNECTION_URL ./bin/db/seed

# Update Cognito user IDs in production database
CONNECTION_URL=$PROD_CONNECTION_URL ./bin/db/update_cognito_user_ids

# Deploy backend ECS service (recreates if torn down)
./bin/ecs/deploy-backend

# Build and deploy frontend
./bin/frontend/build
./bin/ecs/deploy-frontend

# Full teardown (backend + frontend + ALB)
./bin/ecs/teardown-backend
```

---

## Progress Checklist

- [x] Create `prod` branch and push to GitHub
- [x] Create `backend-flask/buildspec.yml` with ECR login, Docker build, image push, and imagedefinitions.json
- [x] Create AWS CodeBuild project `cruddur-backend-flask-bake-image`
- [x] Configure GitHub App connection (AWS CodeConnections)
- [x] Set `PULL_REQUEST_MERGED` webhook trigger on `prod` branch
- [x] Enable privileged mode for Docker-in-Docker builds
- [x] Attach `CruddurCodeBuildECRPolicy` to CodeBuild service role
- [x] Create AWS CodePipeline `cruddur-backend-flask`
- [x] Configure Source stage (GitHub → prod branch)
- [x] Configure Build stage (CodeBuild project)
- [x] Configure Deploy stage (Amazon ECS → cruddur cluster → backend-flask service)
- [x] Attach `CruddurCodePipelineECSPolicy` to CodePipeline service role
- [x] Debug and resolve first pipeline run failures
- [x] Apply production database migration (`add_bio_column`)
- [x] Verify end-to-end pipeline with health check version field
- [x] Confirm `{"success": true, "version": 1}` response at `api.fentoncruddur.com`
- [ ] Frontend CI/CD pipeline (future work)
- [ ] Manual approval stage between Build and Deploy (future work)
- [ ] Automated test stage with pytest (future work)