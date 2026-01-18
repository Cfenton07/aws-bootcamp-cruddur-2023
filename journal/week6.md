# Week 6 — Deploying Containers
____________________________________________________________________

### I added Health-chacks to my backend-flask

```py
#!/usr/bin/env python3

import urllib.request

try:
  response = urllib.request.urlopen('http://localhost:4567/api/health-check')
  if response.getcode() == 200:
    print("[OK] Flask server is running")
    exit(0)  # Success exit code
  else:
    print("[BAD] Flask server is not running")
    exit(1)  # Failure exit code
except Exception as e:
  print("[BAD] Flask server is not running:", e)
  exit(1)  # Failure exit code
```

---

## Why Exit Codes Matter

When ECS runs container health checks, it looks at the **exit code**:
- `exit(0)` = healthy ✅
- `exit(1)` = unhealthy ❌

---

## File Location

Where are you putting this file? I'd suggest:

backend-flask/bin/flask/health-check

# Week 6-7 Journal: ECS Fargate Deployment (Part 1)

## Session Date: January 17, 2026

---

## Overview

This session focused on preparing my Cruddur backend application for deployment to AWS ECS Fargate. I completed all the foundational setup including Docker image preparation, IAM roles, secrets management, and task definition registration.

---

## What I Accomplished

### 1. Dockerfile Updates for Production

**Updated the base image to use my ECR repository instead of Docker Hub:**
```dockerfile
# Changed FROM:
FROM python:3.10-slim-buster

# To:
FROM 931637612335.dkr.ecr.us-east-1.amazonaws.com/cruddur-python:3.10-slim-buster
```

**Updated Flask environment variable for production:**
```dockerfile
# Commented out deprecated setting:
#ENV FLASK_ENV=development

# Added modern replacement for production:
ENV FLASK_DEBUG=0
```

**Key Learning:** `FLASK_ENV` is deprecated in Flask 2.3+. The modern replacement is `FLASK_DEBUG`. For production, always set `FLASK_DEBUG=0` to avoid exposing sensitive error information and the interactive debugger.

---

### 2. Built and Pushed Backend Image to ECR
```bash
# Build the image
docker build -t backend-flask .

# Tag for ECR
docker tag backend-flask:latest $ECR_BACKEND_FLASK_URL:latest

# Push to ECR
docker push $ECR_BACKEND_FLASK_URL:latest
```

**Result:** Successfully pushed with digest `sha256:92047a7f18a47759f72345d6b5c4c2087e61a7961738faa7e90628cf752174ea`

---

### 3. Created IAM Roles

#### CruddurServiceExecutionRole
**Purpose:** Allows ECS to pull images from ECR, write logs to CloudWatch, and read secrets from Parameter Store.

**Trust Policy** (`aws/json/policies/service-execution-trust-policy.json`):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

**Attached Policies:**
- `AmazonECSTaskExecutionRolePolicy` (AWS managed)
- `CruddurServiceExecutionPolicy` (custom - for Parameter Store access)

**Custom Policy** (`aws/json/policies/service-execution-policy.json`):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameters",
        "ssm:GetParameter"
      ],
      "Resource": "arn:aws:ssm:us-east-1:931637612335:parameter/cruddur/backend-flask/*"
    }
  ]
}
```

#### CruddurTaskRole
**Purpose:** Allows the running container to access AWS services (DynamoDB, X-Ray, SSM).

**Attached Policies:**
- `AWSXRayDaemonWriteAccess`
- `AmazonSSMReadOnlyAccess`
- `AmazonDynamoDBFullAccess`

**Key Learning:** There are two distinct IAM roles for ECS:
1. **Execution Role** - Used by ECS itself to set up the container (pull images, fetch secrets, write logs)
2. **Task Role** - Used by the application code inside the container to access AWS services

---

### 4. Created Parameter Store Secrets

Stored sensitive values in AWS Systems Manager Parameter Store:
```bash
# AWS Credentials
aws ssm put-parameter --type "SecureString" \
  --name "/cruddur/backend-flask/AWS_ACCESS_KEY_ID" \
  --value "$AWS_ACCESS_KEY_ID"

aws ssm put-parameter --type "SecureString" \
  --name "/cruddur/backend-flask/AWS_SECRET_ACCESS_KEY" \
  --value "$AWS_SECRET_ACCESS_KEY"

# Database Connection
aws ssm put-parameter --type "SecureString" \
  --name "/cruddur/backend-flask/CONNECTION_URL" \
  --value "$PROD_CONNECTION_URL"

# Honeycomb Observability
aws ssm put-parameter --type "SecureString" \
  --name "/cruddur/backend-flask/OTEL_EXPORTER_OTLP_HEADERS" \
  --value "x-honeycomb-team=YOUR_API_KEY"
```

**Key Learning:** The parameter names in Parameter Store (e.g., `/cruddur/backend-flask/CONNECTION_URL`) are different from your local environment variable names (e.g., `$PROD_CONNECTION_URL`). The Parameter Store path becomes the identifier that ECS uses to inject the value into your container as `CONNECTION_URL`.

---

### 5. Registered Task Definition

**Created** `aws/json/task-definitions/backend-flask.json` with:

| Setting | Value |
|---------|-------|
| Family | backend-flask |
| CPU | 256 |
| Memory | 512 |
| Network Mode | awsvpc |
| Requires | FARGATE |
| Log Group | /cruddurfenton/cluster |
| Region | us-east-1 |

**Container Definitions:**

1. **X-Ray Sidecar Container**
   - Image: `public.ecr.aws/xray/aws-xray-daemon`
   - Port: 2000/udp
   - Purpose: Collects and forwards trace data

2. **Backend Flask Container**
   - Image: `931637612335.dkr.ecr.us-east-1.amazonaws.com/backend-flask`
   - Port: 4567/tcp
   - Health Check: `python /backend-flask/bin/flask/health-check`

**Environment Variables:**
- `OTEL_SERVICE_NAME`
- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `AWS_COGNITO_USER_POOL_ID`
- `AWS_COGNITO_USER_POOL_CLIENT_ID`
- `FRONTEND_URL`
- `BACKEND_URL`
- `AWS_DEFAULT_REGION`

**Secrets (from Parameter Store):**
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `CONNECTION_URL`
- `OTEL_EXPORTER_OTLP_HEADERS`

**Registered with:**
```bash
aws ecs register-task-definition --cli-input-json file://aws/json/task-definitions/backend-flask.json
```

---

## Key Concepts Learned

### Task Definition vs Service vs Task

| Concept | Description |
|---------|-------------|
| **Task Definition** | The "recipe" - defines what containers to run, CPU, memory, environment variables |
| **Task** | A single running instance of a task definition (runs once, doesn't auto-restart) |
| **Service** | Manages tasks - keeps desired count running, integrates with load balancer, auto-restarts |

### Environment Variables vs Secrets

| Type | Use Case | Example |
|------|----------|---------|
| **Environment** | Non-sensitive config | `AWS_DEFAULT_REGION`, `FRONTEND_URL` |
| **Secrets** | Sensitive data | Database passwords, API keys, credentials |

Secrets are stored in Parameter Store and injected at runtime - they never appear in your task definition or logs.

### VS Code in Codespaces Quirks

- `Ctrl+S` may not work reliably to save files
- Use Command Palette (`Ctrl+Shift+P` → "File: Save") as alternative
- Always verify saves with `head` or `cat` commands

---

## Files Created This Session
```
aws/json/
├── policies/
│   ├── service-execution-trust-policy.json
│   ├── service-execution-policy.json
│   └── task-role-trust-policy.json
└── task-definitions/
    └── backend-flask.json
```

---

## Progress Checklist

- [x] Update Dockerfile for ECR base image
- [x] Update Dockerfile for production (FLASK_DEBUG=0)
- [x] Build and push backend-flask to ECR
- [x] Create CruddurServiceExecutionRole
- [x] Create CruddurServiceExecutionPolicy (Parameter Store access)
- [x] Create CruddurTaskRole
- [x] Store secrets in Parameter Store
- [x] Create and register task definition
- [ ] Create Security Groups
- [ ] Create Application Load Balancer
- [ ] Create Target Groups
- [ ] Create ECS Service
- [ ] Test deployment

---

## What's Next

1. **Security Groups** - Control network traffic to containers
2. **Application Load Balancer (ALB)** - Route external traffic to containers
3. **Target Groups** - Connect ALB to ECS tasks
4. **Create ECS Service** - Deploy and run containers on Fargate

---

## Useful Commands Reference
```bash
# Check ECR login
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin "931637612335.dkr.ecr.us-east-1.amazonaws.com"

# List task definitions
aws ecs list-task-definitions

# Describe task definition
aws ecs describe-task-definition --task-definition backend-flask

# List Parameter Store values (names only)
aws ssm get-parameters-by-path --path "/cruddur/backend-flask" --query "Parameters[].Name"

# Update task definition (after changes)
aws ecs register-task-definition --cli-input-json file://aws/json/task-definitions/backend-flask.json
```

---

## Notes for Future Reference

- **Rollbar** can be added later without major refactoring - just uncomment code in `app.py`, add the Parameter Store secret, and update the task definition
- **FLASK_ENV** is deprecated - use **FLASK_DEBUG** instead
- Always verify file saves in Codespaces before running build commands
