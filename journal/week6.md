# Week 6-7 Journal: Deploying Containers to ECS Fargate

**Session Date:** January 17, 2026

---

## Overview

This week marked a major milestone in my Cruddur project—I prepared and deployed my backend Flask application to AWS ECS Fargate. This involved transitioning from local Docker development to a production-ready cloud deployment, complete with proper IAM security, secrets management, networking, and container orchestration.

By the end of this session, I successfully:
- Updated my Docker configuration for production
- Pushed my container image to Amazon ECR
- Configured IAM roles with least-privilege permissions
- Stored sensitive configuration in Parameter Store
- Set up security groups for proper network isolation
- Registered my ECS task definition
- Ran a manual test deployment to verify everything worked

---

## Understanding the ECS Architecture

Before diving into the implementation, I found it helpful to understand how the pieces fit together:

| Concept | Description |
|---------|-------------|
| **Task Definition** | The "recipe" that defines what containers to run, their CPU/memory allocation, environment variables, and networking configuration |
| **Task** | A single running instance of a task definition (runs once and doesn't auto-restart if it fails) |
| **Service** | A manager that keeps a desired number of tasks running, integrates with load balancers, and automatically restarts failed tasks |

Think of it like this: the task definition is a recipe, a task is one batch of cookies made from that recipe, and a service is a baker who ensures there are always fresh cookies on the shelf.

---

## Step 1: Preparing Docker for Production

### Updating the Dockerfile

My first task was updating the backend Dockerfile to use my own ECR-hosted Python base image instead of pulling from Docker Hub. This gives me more control over my base images and avoids Docker Hub rate limits.

**Before:**
```dockerfile
FROM python:3.10-slim-buster
```

**After:**
```dockerfile
FROM 931637612335.dkr.ecr.us-east-1.amazonaws.com/cruddur-python:3.10-slim-buster
```

I also updated the Flask configuration for production:

```dockerfile
# Old (deprecated in Flask 2.3+)
#ENV FLASK_ENV=development

# New (production-safe)
ENV FLASK_DEBUG=0
```

**Why this matters:** `FLASK_ENV` is deprecated in Flask 2.3+. The modern replacement is `FLASK_DEBUG`. Setting `FLASK_DEBUG=0` in production is critical because it:
- Disables the interactive debugger (which could expose sensitive information)
- Prevents detailed error messages from being shown to users
- Improves performance

### Creating a Health Check Script

ECS needs a way to know if my container is healthy. I created a simple Python script that checks if the Flask server is responding:

**File:** `backend-flask/bin/flask/health-check`

```python
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

**Why exit codes matter:** ECS container health checks rely on exit codes to determine container health:
- `exit(0)` = healthy ✅
- `exit(1)` = unhealthy ❌

If the health check returns `exit(1)` too many times, ECS will stop and replace the container.

---

## Step 2: Building and Pushing to ECR

With my Dockerfile ready, I built the image and pushed it to my ECR repository:

```bash
# Build the image locally
docker build -t backend-flask .

# Tag it for ECR
docker tag backend-flask:latest $ECR_BACKEND_FLASK_URL:latest

# Push to ECR
docker push $ECR_BACKEND_FLASK_URL:latest
```

**Result:** Successfully pushed with digest `sha256:92047a7f18a47759f72345d6b5c4c2087e61a7961738faa7e90628cf752174ea`

---

## Step 3: Setting Up IAM Roles

ECS requires two distinct IAM roles, and understanding the difference between them was a key learning moment for me.

### The Two Roles Explained

| Role | Used By | Purpose |
|------|---------|---------|
| **Execution Role** | ECS itself (the service) | Allows ECS to pull images from ECR, fetch secrets from Parameter Store, and write logs to CloudWatch |
| **Task Role** | Your application code | Allows the code running inside your container to access AWS services like DynamoDB, X-Ray, or S3 |

Think of it this way: the Execution Role is like the delivery driver who brings ingredients to a restaurant (ECS setting up the container), while the Task Role is like the chef's access badge that lets them use the kitchen equipment (your app accessing AWS services).

### Creating CruddurServiceExecutionRole

This role allows ECS to set up my containers.

**Trust Policy:** `aws/json/policies/service-execution-trust-policy.json`
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
1. `AmazonECSTaskExecutionRolePolicy` (AWS managed) - Standard permissions for ECS task execution
2. `CruddurServiceExecutionPolicy` (custom) - Access to my Parameter Store secrets

**Custom Policy:** `aws/json/policies/service-execution-policy.json`
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

**Note:** I scoped this policy to only access parameters under `/cruddur/backend-flask/*`. This follows the principle of least privilege—the role can only access what it needs.

### Creating CruddurTaskRole

This role allows my application code to access AWS services at runtime.

**Attached Policies:**
- `AWSXRayDaemonWriteAccess` - For distributed tracing
- `AmazonSSMReadOnlyAccess` - For reading configuration
- `AmazonDynamoDBFullAccess` - For my messaging feature

---

## Step 4: Storing Secrets in Parameter Store

Sensitive values like database passwords and API keys should never be hardcoded in task definitions or environment variables. I stored them in AWS Systems Manager Parameter Store:

```bash
# AWS Credentials
aws ssm put-parameter --type "SecureString" \
  --name "/cruddur/backend-flask/AWS_ACCESS_KEY_ID" \
  --value "$AWS_ACCESS_KEY_ID"

aws ssm put-parameter --type "SecureString" \
  --name "/cruddur/backend-flask/AWS_SECRET_ACCESS_KEY" \
  --value "$AWS_SECRET_ACCESS_KEY"

# Database Connection String
aws ssm put-parameter --type "SecureString" \
  --name "/cruddur/backend-flask/CONNECTION_URL" \
  --value "$PROD_CONNECTION_URL"

# Honeycomb API Key for Observability
aws ssm put-parameter --type "SecureString" \
  --name "/cruddur/backend-flask/OTEL_EXPORTER_OTLP_HEADERS" \
  --value "x-honeycomb-team=YOUR_API_KEY"
```

**Key Learning:** The parameter names in Parameter Store (e.g., `/cruddur/backend-flask/CONNECTION_URL`) are different from my local environment variable names (e.g., `$PROD_CONNECTION_URL`). In my task definition, I reference the Parameter Store ARN, and ECS injects the value as `CONNECTION_URL` into the container environment.

### Environment Variables vs Secrets

| Type | Use Case | Example |
|------|----------|---------|
| **Environment Variables** | Non-sensitive configuration | `AWS_DEFAULT_REGION`, `FRONTEND_URL` |
| **Secrets** | Sensitive data | Database passwords, API keys, credentials |

Secrets are stored encrypted in Parameter Store and injected at runtime—they never appear in your task definition JSON or CloudWatch logs.

---

## Step 5: Configuring Security Groups

Security groups act as virtual firewalls controlling traffic flow. I created security groups to establish proper network isolation following this flow:

```
Internet → ALB (port 80/443) → ECS (port 4567) → RDS (port 5432)
```

### Security Group Configuration

**ALB Security Group (`crud-alb-sg`):**
- Inbound: Allow HTTP (80) and HTTPS (443) from anywhere (0.0.0.0/0)
- Outbound: Allow traffic to ECS security group on port 4567

**ECS Security Group (`crud-ecs-sg`):**
- Inbound: Allow port 4567 only from the ALB security group
- Outbound: Allow traffic to RDS security group on port 5432, plus internet access for external APIs

**RDS Security Group (`crud-rds-sg`):**
- Inbound: Allow port 5432 only from the ECS security group
- Outbound: None needed (RDS doesn't initiate connections)

**Why this matters:** By chaining security groups, I ensure that:
- The database is never directly accessible from the internet
- Only my ECS containers can reach the database
- Only my ALB can reach my containers

---

## Step 6: Creating the Task Definition

The task definition is the heart of my ECS configuration. It defines everything about how my containers should run.

**File:** `aws/json/task-definitions/backend-flask.json`

### Task-Level Settings

| Setting | Value | Why |
|---------|-------|-----|
| Family | `backend-flask` | Logical name for versioning |
| CPU | 256 (0.25 vCPU) | Sufficient for my Flask app |
| Memory | 512 MB | Enough headroom for the app + X-Ray |
| Network Mode | `awsvpc` | Required for Fargate; gives each task its own ENI |
| Requires | `FARGATE` | Serverless compute (no EC2 management) |

### Container Definitions

My task runs two containers:

**1. X-Ray Sidecar Container**
- Image: `public.ecr.aws/xray/aws-xray-daemon`
- Port: 2000/udp
- Purpose: Collects distributed tracing data from my application

**2. Backend Flask Container**
- Image: `931637612335.dkr.ecr.us-east-1.amazonaws.com/backend-flask`
- Port: 4567/tcp
- Health Check: `python /backend-flask/bin/flask/health-check`

**Environment Variables (non-sensitive):**
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

### Registering the Task Definition

```bash
aws ecs register-task-definition --cli-input-json file://aws/json/task-definitions/backend-flask.json
```

---

## Step 7: Manual Test Deployment

Before setting up the full service with load balancing, I ran a manual test deployment through the AWS Console to verify my configuration was correct.

### What I Did

1. Navigated to ECS in the AWS Console
2. Selected my cluster
3. Clicked "Run new task"
4. Selected my `backend-flask` task definition
5. Configured networking (VPC, subnets, security groups)
6. Launched the task

### Results

✅ Task started successfully
✅ Container health check passed
✅ Logs appeared in CloudWatch
✅ X-Ray sidecar running alongside the main container

### Cleanup

After confirming everything worked, I stopped the task to avoid unnecessary charges. ECS Fargate bills by the second, so leaving test tasks running adds up quickly.

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

backend-flask/bin/flask/
└── health-check
```

---

## Progress Checklist

- [x] Update Dockerfile for ECR base image
- [x] Update Dockerfile for production (FLASK_DEBUG=0)
- [x] Create health check script
- [x] Build and push backend-flask to ECR
- [x] Create CruddurServiceExecutionRole
- [x] Create CruddurServiceExecutionPolicy (Parameter Store access)
- [x] Create CruddurTaskRole
- [x] Store secrets in Parameter Store
- [x] Create security groups
- [x] Create and register task definition
- [x] Run manual test deployment
- [ ] Create Application Load Balancer
- [ ] Create Target Groups
- [ ] Create ECS Service
- [ ] Test end-to-end deployment

---

## What's Next

1. **Application Load Balancer (ALB)** - Route external traffic to my containers
2. **Target Groups** - Connect the ALB to my ECS tasks
3. **Create ECS Service** - Deploy and manage containers with auto-restart and scaling

---

## Useful Commands Reference

```bash
# ECR Login
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin "931637612335.dkr.ecr.us-east-1.amazonaws.com"

# List all task definitions
aws ecs list-task-definitions

# Describe a specific task definition
aws ecs describe-task-definition --task-definition backend-flask

# List Parameter Store values (names only, no secrets exposed)
aws ssm get-parameters-by-path --path "/cruddur/backend-flask" --query "Parameters[].Name"

# Register/update a task definition
aws ecs register-task-definition --cli-input-json file://aws/json/task-definitions/backend-flask.json

# List running tasks in a cluster
aws ecs list-tasks --cluster cruddur

# Stop a running task
aws ecs stop-task --cluster cruddur --task <task-id>
```

---

## Lessons Learned

1. **Execution Role vs Task Role** - These serve completely different purposes. Getting them confused leads to permission errors that are hard to debug.

2. **Parameter Store naming** - The path structure matters. I organized mine as `/cruddur/backend-flask/*` which makes IAM policies cleaner and more secure.

3. **Always test manually first** - Running a manual task before creating a service helped me catch configuration issues without the complexity of load balancers and auto-scaling.

4. **Clean up test resources** - Fargate charges by the second. Always stop test tasks when done.

5. **Security group chaining** - Reference other security groups instead of IP ranges when possible. This makes the configuration more maintainable and secure.

---

## Notes for Future Reference

- **Rollbar** can be added later without major refactoring—just uncomment the code in `app.py`, add the Parameter Store secret, and update the task definition
- **FLASK_ENV is deprecated** - Always use `FLASK_DEBUG` instead
- **VS Code in Codespaces quirk** - Ctrl+S may not work reliably; use Command Palette (Ctrl+Shift+P → "File: Save") as an alternative, and always verify saves with `head` or `cat` commands before building
