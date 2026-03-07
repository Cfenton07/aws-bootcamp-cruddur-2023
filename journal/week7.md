# Week 7 — Fargate: Configuring for Container Insights

**Date:** March 5–7, 2026  
**Bootcamp Video:** Week 7 - Fargate - Configuring for Container Insights  

---

## Overview

This week I added observability tooling to my ECS Fargate deployment — X-Ray distributed tracing via sidecar containers, Container Insights for cluster-level metrics, and a complete environment variable management system using `envsubst` templates. I also built local production container testing infrastructure (run scripts, Docker networking, BusyBox debug utility) so I can verify production images before deploying to AWS.

My implementation diverges from the instructor's approach in a key area: I used `envsubst` (built into Linux) instead of Ruby/ERB templates for environment variable generation. This eliminates the Ruby dependency, requires no gem installations, and accomplishes the same result in a single command.

---

## Session 1 — X-Ray Sidecar + Container Insights (March 5)

### Analyzing the Transcript

I started by reading through the full Week 7 video transcript and breaking it into discrete work items. Andrew spends most of the video wrestling with Docker networking, `.env` file quoting issues, and health check failures — a lot of trial and error. I identified 10 distinct tasks, prioritized them, and tackled the core deliverables first.

### X-Ray Sidecar Container

Added the AWS X-Ray daemon as a sidecar container in both task definitions (`backend-flask.json` and `frontend-react-js.json`). The sidecar runs alongside the application container in the same ECS task and listens for trace data on UDP port 2000.

**X-Ray sidecar container definition (added to both task definitions):**
```json
{
  "name": "xray",
  "image": "public.ecr.aws/xray/aws-xray-daemon",
  "essential": true,
  "user": "1337",
  "portMappings": [
    {
      "name": "xray",
      "containerPort": 2000,
      "protocol": "udp"
    }
  ]
}
```

Key details:
- Image pulls from the **public ECR registry** — no need to build or push our own
- `user: "1337"` is required by AWS (must be a string, not an integer — Andrew hit this exact error)
- Port 2000 UDP is the X-Ray daemon's listening port
- `essential: true` means the task stops if the daemon crashes

### AWS_XRAY_URL Environment Variable

Added `AWS_XRAY_URL` to the backend task definition's environment array:
```json
{"name": "AWS_XRAY_URL", "value": "*fentoncruddur.com*"}
```

This configures the X-Ray recorder's `dynamic_naming` parameter. The wildcard pattern tells X-Ray to use the actual request hostname for segment naming, so traces show up as `api.fentoncruddur.com` in the CloudWatch console instead of a generic service name.

### Verification Checklist (Before Deploying)

Before deploying, I verified the entire X-Ray pipeline:

| Check | Status | Details |
|-------|--------|---------|
| X-Ray sidecar in backend task def | ✅ | Already present from earlier work |
| X-Ray sidecar in frontend task def | ✅ | Added this session |
| Health check script path | ✅ | `bin/flask/health-check` correctly at `/backend-flask/bin/flask/health-check` in Docker image via `COPY . .` |
| X-Ray instrumentation in app.py | ✅ | `XRayMiddleware`, `xray_recorder.configure()`, `@xray_recorder.capture()` decorators all active |
| CruddurTaskRole permissions | ✅ | `AWSXRayDaemonWriteAccess` policy attached — covers `PutTraceSegments`, `PutTelemetryRecords`, `GetSamplingRules`, `GetSamplingTargets`, `GetSamplingStatisticSummaries` |

**Why the task role matters:** On Fargate, the X-Ray sidecar authenticates using the **task role** (not the execution role) to forward traces to the X-Ray service. Without `AWSXRayDaemonWriteAccess`, the daemon starts fine but silently drops all traces.

### Register Scripts

Created `bin/backend/register` and `bin/frontend/register` — simple scripts that push task definition JSON to ECS, creating a new revision each time:

```bash
aws ecs register-task-definition \
  --cli-input-json "file://$TASK_DEF_PATH"
```

This saves me from having to look up the register command each time. The scripts handle path resolution automatically.

### Deployment and Verification

Deployed both services with the new task definitions:
```bash
./bin/backend/register
./bin/frontend/register
aws rds start-db-instance --db-instance-identifier cruddur-db-instance
./bin/ecs/deploy-backend
./bin/frontend/build
./bin/ecs/deploy-frontend
```

Enabled Container Insights: ECS Console → Clusters → cruddur → Update → Monitoring → Container Insights checkbox.

**Results in CloudWatch:**
- X-Ray Traces: 47 traces captured, all returning 200 OK
- Trace Map: `api.fentoncruddur.com` showing 100% OK rate, 3ms average latency, 0 faults
- Container Insights: Active on the cruddur cluster

The `AWS_XRAY_URL` dynamic naming is confirmed working — the Trace Map labels the service as `api.fentoncruddur.com`.

### Domain Suspension Fix

Discovered `fentoncruddur.com` was suspended (`clientHold` status) because I hadn't verified my registrant email within 15 days of registration. Fixed by:
1. Route 53 → Registered domains → fentoncruddur.com → Send email again
2. Clicked verification link in email
3. Status changed from `clientHold` to `ok`, `Reachability Verified`
4. Flushed local DNS cache: `ipconfig /flushdns` (Windows)

**Lesson:** Domain registration email verification has a hard deadline. If you miss it, ICANN suspends DNS resolution. The fix is quick but the domain stays unreachable until the hold is lifted and DNS caches clear.

---

## Session 2 — Environment Variable Templates + Docker Networking (March 7)

### The Problem

When running production Docker images locally with `docker run --env-file`, environment variables containing `${VARIABLE}` references don't get substituted — unlike `docker-compose`, which handles substitution automatically. Andrew solved this with Ruby/ERB templates. I used `envsubst` instead.

### Environment Variable Template System

**Architecture:**
```
.env.template (committed to repo, has ${VAR} placeholders)
        ↓ envsubst
.env (generated locally, has real values, gitignored)
        ↓ read by
docker-compose.yml (via env_file:) and docker run (via --env-file)
```

**Template files (project root):**

`backend-flask.env.template`:
```
FLASK_DEBUG=1
CONNECTION_URL=postgresql://postgres:POSTGRES_PASSWORD@db:5432/cruddur
FRONTEND_URL=https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}
BACKEND_URL=https://${CODESPACE_NAME}-4567.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}
OTEL_SERVICE_NAME=backend-flask
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
AWS_XRAY_URL=*${CODESPACE_NAME}-4567.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}*
AWS_XRAY_DAEMON_ADDRESS=xray-daemon:2000
AWS_REGION=${AWS_DEFAULT_REGION}
AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
ROLLBAR_ACCESS_TOKEN=${ROLLBAR_ACCESS_TOKEN}
AWS_COGNITO_USER_POOL_ID=us-east-1_wAg3Cr3Px
AWS_COGNITO_USER_POOL_CLIENT_ID=12va2n69rq2of98ivm60b9625v
AWS_ENDPOINT_URL=http://dynamodb-local:8000
```

`frontend-react-js.env.template`:
```
REACT_APP_BACKEND_URL=https://${CODESPACE_NAME}-4567.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}
REACT_APP_AWS_PROJECT_REGION=us-east-1
REACT_APP_AWS_COGNITO_REGION=us-east-1
REACT_APP_AWS_USER_POOLS_ID=us-east-1_wAg3Cr3Px
REACT_APP_CLIENT_ID=12va2n69rq2of98ivm60b9625v
```

**Generate scripts** (`bin/backend/generate-env` and `bin/frontend/generate-env`):

The core of each script is a single line:
```bash
envsubst < "$TEMPLATE_PATH" > "$OUTPUT_PATH"
```

`envsubst` reads the template, replaces every `${VAR}` with its actual value from the current shell environment, and writes the resolved file. No Ruby, no gems, no ERB syntax.

**Why this is better than Andrew's ERB approach:**
- `envsubst` is pre-installed on most Linux systems — zero dependencies
- No new language to learn or maintain
- Same `${VAR}` syntax used everywhere (docker-compose, bash, templates)
- Single command vs. a Ruby script with `require 'erb'`, file I/O, and binding management

### docker-compose.yml Refactor

Moved environment variables from inline `environment:` blocks to `env_file:` references:

```yaml
services:
  backend-flask:
    env_file:
      - backend-flask.env
    # ... (no more inline env vars)
```

Added explicit `networks: - cruddur-net` to every service and defined a user-defined bridge network:

```yaml
networks:
  cruddur-net:
    driver: bridge
    name: cruddur-net
```

**Why user-defined network matters:** The default Docker bridge network doesn't support DNS resolution between containers. With a user-defined network (`cruddur-net`), containers can reach each other by service name (e.g., `ping xray-daemon`). This is essential for the production run scripts, which need individually-launched containers to talk to docker-compose services.

### Automated Environment File Generation

Added generate-env calls to `.devcontainer/post-start.sh` so `.env` files are regenerated automatically every time the Codespace boots:

```bash
# ========================================
# GENERATE ENVIRONMENT FILES
# ========================================
echo "🔧 Generating environment files..."
./bin/backend/generate-env
./bin/frontend/generate-env
echo "✅ Environment files generated"
```

This runs before the RDS security group update, ensuring env files are ready before any docker commands.

### .gitignore Update

Added generated `.env` files to `.gitignore`:
```
backend-flask.env
frontend-react-js.env
```

These files contain resolved AWS secrets after `envsubst` runs. The `.template` files are safe to commit — they only have `${VAR}` placeholders.

### Production Run Scripts

Created `bin/backend/run` and `bin/frontend/run` for testing production Docker images locally:

```bash
docker run --rm \
  --env-file "$ENVFILE_PATH" \
  --network cruddur-net \
  --publish 4567:4567 \
  -it \
  backend-flask
```

**Key flags:**
- `--env-file` loads the generated `.env` file (resolved values, no `${VAR}` placeholders)
- `--network cruddur-net` connects to the same network as docker-compose services
- `--rm` cleans up the container on exit

### BusyBox Debug Utility

Created `bin/busybox` — launches a minimal container on the `cruddur-net` network for debugging connectivity:

```bash
docker run --rm --network cruddur-net -it busybox
```

Useful commands inside BusyBox: `ping xray-daemon`, `telnet db 5432`, `nslookup backend-flask`.

### Testing

**Test 1 — docker-compose with env_file:**
```bash
./bin/backend/generate-env
./bin/frontend/generate-env
docker compose up
```
Result: All 6 services started on `cruddur-net`. Home feed, authentication, Crud posting, Messages (with Babylon 5 conversation) all working. ✅

**Test 2 — Production container locally:**
```bash
docker compose up db dynamodb-local xray-daemon otel-collector
# In second terminal:
./bin/backend/run
```
Result: Flask started with debug mode OFF, X-Ray middleware initialized, health check at `/api/health-check` returned `{"success": true}`. Production image verified working on local network. ✅

---

## Key Differences from Instructor's Implementation

| Area | Andrew's Approach | My Approach |
|------|------------------|-------------|
| Env var templates | Ruby/ERB (`require 'erb'`, `.erb` files) | `envsubst` (built-in Linux tool, `.template` files) |
| Template language | ERB syntax: `<%= ENV['VAR'] %>` | Standard bash: `${VAR}` |
| Dependencies | Ruby runtime required | None — `envsubst` pre-installed |
| `.env` quoting | Hit issues with quoted values in `docker run --env-file`, had to remove all quotes | Not an issue — `envsubst` outputs unquoted by default |
| Network naming | Went through `internal-network` → `crudder` → `cruddur-x` → `cruddur-net` | Set `cruddur-net` from the start |
| Health check debugging | Spent significant time debugging health check failures caused by missing script in Docker image | Verified path was correct before deploying — no issues |

---

## Files Modified / Created

**New files:**
- `backend-flask.env.template` — backend env var template
- `frontend-react-js.env.template` — frontend env var template
- `bin/backend/generate-env` — generates backend `.env` from template
- `bin/frontend/generate-env` — generates frontend `.env` from template
- `bin/backend/register` — registers backend task definition with ECS
- `bin/frontend/register` — registers frontend task definition with ECS
- `bin/backend/run` — runs production backend container locally
- `bin/frontend/run` — runs production frontend container locally
- `bin/busybox` — network debug utility

**Modified files:**
- `aws:json/task-definitions/backend-flask.json` — added `AWS_XRAY_URL` env var
- `aws:json/task-definitions/frontend-react-js.json` — added X-Ray sidecar container
- `docker-compose.yml` — switched to `env_file:`, added `cruddur-net` network to all services
- `.devcontainer/post-start.sh` — added generate-env calls for auto-generation on boot
- `.gitignore` — added `backend-flask.env` and `frontend-react-js.env`

---

## Progress Checklist

- [x] X-Ray sidecar in backend task definition
- [x] X-Ray sidecar in frontend task definition
- [x] AWS_XRAY_URL dynamic naming configured
- [x] Container Insights enabled on cluster
- [x] X-Ray traces verified in CloudWatch (47 traces, 100% OK, 3ms avg latency)
- [x] Register scripts for backend and frontend
- [x] Health check script path verified in Docker image
- [x] CruddurTaskRole X-Ray permissions verified
- [x] Environment variable template system (envsubst)
- [x] Generate-env scripts for backend and frontend
- [x] Automated generation in post-start.sh
- [x] docker-compose.yml refactored with env_file and cruddur-net
- [x] Production run scripts for backend and frontend
- [x] BusyBox debug utility
- [x] .gitignore updated for generated .env files
- [x] Domain suspension resolved (registrant email verification)
- [x] Full production deployment verified (fentoncruddur.com)
- [x] Local docker-compose verified with new env_file approach
- [x] Local production container testing verified

---

## Commands Reference

```bash
# Generate environment files (auto-runs on Codespace boot)
./bin/backend/generate-env
./bin/frontend/generate-env

# Register task definitions (no build needed)
./bin/backend/register
./bin/frontend/register

# Test production container locally
docker compose up db dynamodb-local xray-daemon otel-collector
./bin/backend/run    # in second terminal

# Debug container networking
./bin/busybox
# Inside: ping xray-daemon, telnet db 5432, nslookup backend-flask

# Full production deployment sequence
aws rds start-db-instance --db-instance-identifier cruddur-db-instance
./bin/backend/register
./bin/frontend/register
./bin/ecs/deploy-backend
./bin/frontend/build        # only if frontend code changed
./bin/ecs/deploy-frontend

# Enable Container Insights (one-time)
# ECS Console → Clusters → cruddur → Update → Monitoring → Container Insights

# Check X-Ray traces
# CloudWatch → Traces, Trace Map

# Flush local DNS cache (Windows) after domain changes
ipconfig /flushdns
```