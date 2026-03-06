# Cruddur AWS Bootcamp — Engineering Journal
## Week 6–7 | Week 6.5

*Two case studies documenting systematic debugging of infrastructure problems that disguised themselves as application bugs — and the mental model for catching them early.*

---

# Case Study 1: CORS Debugging on AWS ECS Fargate

*How a missing ALB routing rule disguised itself as a Flask code problem*

| | |
|---|---|
| **Date** | February 18, 2026 |
| **Week** | 6–7 — ECS Fargate Deployment |
| **Time Spent** | ~1.5 hours |
| **Status** | ✅ Resolved |
| **Root Cause** | ALB had no routing rule to send `/api/*` to the Flask backend |

---

## Interview-Ready Summary

> "I deployed a full-stack app on AWS ECS Fargate with an Application Load Balancer. The frontend loaded fine but all API calls were blocked by CORS errors. I debugged it systematically — checking the Flask code, then environment variables, then container logs — before realizing the root cause was at the infrastructure layer: the ALB had no listener rule to route `/api/*` requests to the Flask backend. Every API call was silently hitting the React/nginx frontend instead, which returned 405. The fix was adding a single ALB routing rule."

---

## What Was I Trying to Do?

I had successfully deployed Cruddur to AWS ECS Fargate with an ALB, a custom domain (`fentoncruddur.com`), and SSL. The frontend was loading correctly at `https://fentoncruddur.com`, but the home feed wasn't populating and the Crud button wasn't working. I needed to debug why the app wasn't functioning even though the infrastructure appeared healthy.

---

## What Went Wrong?

Every API call from the React frontend to the Flask backend was being blocked by a CORS error. The browser console showed:

```
Access to fetch at 'https://api.fentoncruddur.com/api/activities/home'
from origin 'https://fentoncruddur.com' has been blocked by CORS policy:
No 'Access-Control-Allow-Origin' header is present.
```

The Network tab showed the preflight `OPTIONS` request returning **405 Not Allowed**.

---

## How I Debugged It — Layer by Layer

The most important thing I learned: **debugging in distributed systems means working through layers systematically**, not jumping straight to the code.

### Layer 1 — Browser (Start Here Always)

Opened DevTools → Network tab and hard refreshed. Could immediately see:
- The request to `/api/activities/home` had a CORS error status
- The preflight OPTIONS request was returning **405**

> **Lesson:** Always start with the browser. DevTools tells you exactly what's failing before you touch any code or infrastructure.

### Layer 2 — Infrastructure (Check Before Code)

Used `curl` to manually send an OPTIONS preflight request and checked the response headers:

```bash
curl -X OPTIONS https://api.fentoncruddur.com/api/activities/home \
  -H "Origin: https://fentoncruddur.com" \
  -v 2>&1 | grep "server:"
```

The response showed:

```
server: nginx/1.25.5
```

This was the breakthrough moment. **nginx** is the web server inside the React frontend container — not Flask. My API requests were never reaching the backend at all. They were hitting the React container, which had no idea what to do with an OPTIONS request.

**Root cause identified:** The ALB had only one rule — send all traffic to the React frontend. There was no rule to route `/api/*` traffic to the Flask backend.

> **Lesson:** `curl -v` + checking the `server:` response header immediately tells you WHO is answering your request. If you expected Flask but see nginx, the routing is wrong. Check infrastructure before code.

### Layer 3 — Application Code

SSHed into the running container to verify the Flask code was correct:

```bash
aws ecs execute-command \
  --cluster cruddur \
  --task $(aws ecs list-tasks --cluster cruddur --service-name backend-flask \
    --query "taskArns[0]" --output text) \
  --container backend-flask --interactive \
  --command "/bin/sh -c 'grep -n cross_origin /backend-flask/app.py'"
```

The code was correct — `@cross_origin()` was present and `OPTIONS` was in the methods list. The problem wasn't in the code.

> **Lesson:** Don't assume your local changes made it into the running container. Always verify by connecting directly into the container.

### Layer 4 — Environment Variables

While investigating, discovered the running container had empty environment variables:

```bash
aws ecs execute-command \
  --command "/bin/sh -c 'env | grep -E \"FRONTEND|BACKEND\"'"
# Output:
# FRONTEND_URL=
# BACKEND_URL=
```

Flask builds its CORS allowed origins list from these variables:

```python
origins = [os.getenv('FRONTEND_URL'), os.getenv('BACKEND_URL')]
```

Empty values meant the list was `[None, None]` — so every request was blocked regardless of what the code said.

**Why were they empty?** The ECS service was running `backend-flask:3`, an old task definition revision created before I added those variables. Even though my `backend-flask.json` in the repo had the correct values, a new revision had never been registered and deployed.

> **Lesson:** Updating a file in your repo does nothing to AWS. You must explicitly run `register-task-definition` AND `update-service --force-new-deployment` to get changes live.

---

## The Fix

Two separate fixes were needed:

### Fix 1 — Register and deploy the updated task definition

```bash
# Register new revision from the correct JSON file
aws ecs register-task-definition \
  --cli-input-json file://aws/json/task-definitions/backend-flask.json

# Force the service to use the new revision
aws ecs update-service \
  --cluster cruddur --service backend-flask \
  --task-definition backend-flask --force-new-deployment
```

### Fix 2 — Add the ALB routing rule

In AWS Console → EC2 → Load Balancers → cruddur-alb → HTTPS:443 listener → Add rule:

| Setting | Value |
|---------|-------|
| Priority | 1 |
| Condition | Path is `/api/*` |
| Action | Forward to `cruddur-backend-flask-tg` |

This was the actual root cause fix. Once the ALB knew to send `/api/*` traffic to Flask instead of React, CORS worked immediately.

---

## Architecture: Before vs After

```
BEFORE (broken):
Browser → ALB → ALL traffic → React/nginx → 405 on OPTIONS  ❌

AFTER (fixed):
Browser → ALB → /api/*          → Flask backend → 200 + CORS headers  ✅
              → everything else → React/nginx   → serves the app       ✅
```

---

## What I Learned

### 1. Infrastructure problems disguise themselves as code problems
The CORS error in the browser made it look like a Flask configuration issue. It was actually an ALB routing misconfiguration. I spent time checking code that was already correct because I didn't check the infrastructure layer first. Going forward: when I see a network error, my first question should be *"is the request even reaching the right server?"* before looking at any application code.

### 2. Running containers are not your source files
The code in GitHub and the code running in production are two completely separate things. AWS doesn't automatically pull from GitHub. The pipeline is:

```
Edit code → Build Docker image → Push to ECR → Register task definition → Deploy service
```

If any of those steps are skipped, your changes don't exist in production.

### 3. Task definition changes require an explicit deploy cycle
1. Edit `backend-flask.json`
2. Run `aws ecs register-task-definition --cli-input-json file://...` (creates a new revision)
3. Run `aws ecs update-service --force-new-deployment` (deploys it)

Skipping step 2 or 3 means the old revision keeps running forever.

### 4. `curl -v` is one of the most powerful debugging tools available
```bash
curl -X OPTIONS https://api.fentoncruddur.com/api/activities/home \
  -H "Origin: https://fentoncruddur.com" \
  -v 2>&1 | grep "server:"
```
This single command revealed the entire root cause in seconds. The `server:` header tells you exactly which software is answering — Flask, nginx, the ALB itself, etc.

### 5. ALB path-based routing is fundamental to multi-service architectures
This pattern — one ALB, route `/api/*` to the backend and everything else to the frontend — is extremely common in production. It's how you run a full-stack app behind a single domain without separate ports. Always configure this routing rule when setting up an ALB for a full-stack app.

---

## Debugging Checklist for Future CORS Issues

- [ ] **Browser DevTools → Network tab** — what status code is the preflight returning?
- [ ] **`curl -v` + check `server:` header** — is the right server even answering?
- [ ] **ALB listener rules** — does `/api/*` route to the backend target group?
- [ ] **Running container env vars** — `env | grep FRONTEND` inside the container
- [ ] **Task definition revision** — which revision is the service actually running?
- [ ] **Flask code** — is `@cross_origin()` and `OPTIONS` on the endpoint?

---

## Commands Reference

```bash
# SSH into a running ECS Fargate container
aws ecs execute-command \
  --cluster cruddur \
  --task $(aws ecs list-tasks --cluster cruddur --service-name backend-flask \
    --query "taskArns[0]" --output text) \
  --container backend-flask --interactive \
  --command "/bin/sh -c 'YOUR_COMMAND_HERE'"

# Verify env vars in the running container
--command "/bin/sh -c 'env | grep -E \"FRONTEND|BACKEND\"'"

# Check which task definition revision the service is using
aws ecs describe-services --cluster cruddur --services backend-flask \
  --query "services[0].taskDefinition"

# Register new task definition revision
aws ecs register-task-definition \
  --cli-input-json file://aws/json/task-definitions/backend-flask.json

# Force new deployment
aws ecs update-service --cluster cruddur --service backend-flask \
  --task-definition backend-flask --force-new-deployment

# Test CORS preflight and identify which server is responding
curl -X OPTIONS https://api.fentoncruddur.com/api/activities/home \
  -H "Origin: https://fentoncruddur.com" \
  -H "Access-Control-Request-Method: GET" \
  -v 2>&1 | grep -E "< |server:"
```

---

---

# Case Study 2: Cognito Token Refresh & DynamoDB Debugging

*How a commented-out Docker environment variable silently routed all queries to the wrong database*

| | |
|---|---|
| **Date** | March 3–4, 2026 |
| **Week** | 6.5 — Local Integration Testing |
| **Status** | ✅ Resolved |
| **Root Cause** | `AWS_ENDPOINT_URL` commented out in `docker-compose.yml` |

---

## Overview

This session focused on implementing centralized Cognito access token refresh across the entire Cruddur frontend, then testing the full application locally in Docker. What started as a straightforward frontend code change turned into a deep debugging session that uncovered multiple environment issues — a mismatched Cognito user ID, a seed data syntax error, and ultimately a commented-out Docker environment variable that caused the backend to silently query the wrong DynamoDB instance.

By the end of this session, I successfully:
- Created a centralized `getAccessToken()` utility for automatic token refresh
- Migrated all 8 React components from legacy auth patterns to Amplify v6
- Removed all Cookies-based authentication code from the frontend
- Fixed local database seeding issues (PostgreSQL and DynamoDB)
- Debugged and resolved a silent infrastructure misconfiguration in `docker-compose.yml`
- Verified end-to-end functionality: Home feed, Notifications, Crud posting, and Messages

---

## The Problem: Access Tokens Expire After 1 Hour

Cognito access tokens have a default TTL of 1 hour. After expiration, any API call using the old token silently fails — the backend receives an invalid JWT, authentication fails, and the user sees empty data or errors with no indication of what went wrong.

The original codebase handled tokens in two problematic ways:

| Pattern | Files Using It | Problem |
|---------|---------------|---------|
| `localStorage` via Cookies import | NotificationsFeedPage, UserFeedPage | Token stored once at login, never refreshed. After 1 hour, every API call fails silently. |
| Inline `fetchAuthSession()` in each component | HomeFeedPage, MessageGroupsPage, MessageGroupPage, MessageGroupNewPage, MessageForm | Token refresh logic duplicated everywhere. No single place to update if the pattern changes. |

---

## Step 1: Creating the Centralized Token Refresh Utility

I added a `getAccessToken()` function to `CheckAuth.js` that any component can import:

**File:** `frontend-react-js/src/lib/CheckAuth.js`

```javascript
import { getCurrentUser, fetchAuthSession, fetchUserAttributes } from 'aws-amplify/auth';

export async function getAccessToken() {
  try {
    const session = await fetchAuthSession();
    const accessToken = session?.tokens?.accessToken?.toString();
    return accessToken;
  } catch (err) {
    console.log('Error getting access token:', err);
    return null;
  }
}

export async function checkAuth(setUser) {
  try {
    const cognitoUser = await getCurrentUser();
    const userAttributes = await fetchUserAttributes();
    setUser({
      display_name: userAttributes.name,
      handle: userAttributes.preferred_username,
      cognito_user_id: userAttributes.sub
    });
    return cognitoUser;
  } catch (err) {
    console.log('User is not authenticated:', err);
    setUser(null);
    return null;
  }
}
```

**How `fetchAuthSession()` handles refresh:** When called, the Amplify SDK internally checks whether the current access token is expired. If it is, the SDK uses the refresh token to obtain a new one from Cognito automatically. If the token is still valid, it returns the cached token instantly with no network call. Components don't need to know or care about token expiration — they just call `getAccessToken()` and always get a valid token back.

**Why this is better than `localStorage`:** Storing JWTs in localStorage means any JavaScript on the page (including potential XSS attacks) could read them. Amplify's internal token storage is not accessible from arbitrary JS, making this approach more secure.

---

## Step 2: Migrating All Components

### The Migration Pattern

**Before (inline fetchAuthSession):**
```javascript
import { fetchAuthSession } from 'aws-amplify/auth';
const session = await fetchAuthSession();
const accessToken = session?.tokens?.accessToken?.toString();
const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
```

**Before (legacy Cookies pattern):**
```javascript
import Cookies from 'js-cookie';
const access_token = Cookies.get('access_token');
const res = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } });
```

**After (centralized):**
```javascript
import { getAccessToken } from '../lib/CheckAuth';
const access_token = await getAccessToken();
const res = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } });
```

### Files Modified

| File | Previous Pattern | Changes Made |
|------|-----------------|--------------|
| `HomeFeedPage.js` | Inline `fetchAuthSession` | Replaced with `getAccessToken()` import |
| `MessageGroupsPage.js` | Inline `fetchAuthSession` | Replaced with `getAccessToken()` import |
| `MessageGroupPage.js` | Inline `fetchAuthSession` | Replaced with `getAccessToken()` import |
| `MessageGroupNewPage.js` | Inline `fetchAuthSession` | Replaced with `getAccessToken()` import |
| `MessageForm.js` | Inline `fetchAuthSession` | Replaced with `getAccessToken()` import |
| `NotificationsFeedPage.js` | `Cookies.get('access_token')` | Removed Cookies import, added `getAccessToken()` |
| `UserFeedPage.js` | `Cookies.get('access_token')` | Removed Cookies import, added `getAccessToken()` |

All seven consumer files now import from the same source. If the token retrieval logic ever needs to change again, only `CheckAuth.js` needs to be updated.

---

## Step 3: Local Testing — Environment Setup

### Codespaces ECR Authentication

Starting a new Codespace session means AWS credentials are fresh but ECR login tokens have expired. The first `docker compose up` failed with `403 Forbidden` when pulling the custom base image from ECR:

```bash
# Re-authenticate with ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  931637612335.dkr.ecr.us-east-1.amazonaws.com

# Then start containers
docker compose up
```

### Codespaces Port Visibility

Ports 3000 (frontend) and 4567 (backend) defaulted to Private visibility in Codespaces. This caused `401 Unauthorized` on preflight OPTIONS requests because the Codespaces proxy blocks unauthenticated requests to private ports. Fix: change both ports to **Public** in the PORTS tab.

> **Lesson:** Every new Codespace session requires checking port visibility. Private ports block CORS preflight requests — this looks identical to an application CORS bug but is actually a Codespaces infrastructure issue.

---

## Step 4: Database Seeding Issues

### PostgreSQL Seed Data Fix

The `seed.sql` file had a missing comma after the second VALUES row:

```sql
-- BROKEN
VALUES
  ('Chris Fenton', 'chrisfenton1000@gmail.com', 'chrisfenton' ,'MOCK'),
  ('Antwuan Jacobs', 'fentonmgmt@gmail.com', 'Aj-skynet' ,'MOCK')  -- missing comma
  ('Gold Grill', 'goldgrill@cruddur.com', 'goldgrill' ,'MOCK');

-- FIXED
  ('Antwuan Jacobs', 'fentonmgmt@gmail.com', 'Aj-skynet' ,'MOCK'),  -- comma added
```

### Cognito User ID Mismatch

After seeding, the Messages page returned `TypeError: 'NoneType' object is not subscriptable`. The backend was extracting the real Cognito user ID from the JWT (`84286418-b0f1-70f4-d737-6829e77743a6`), but the PostgreSQL users table had `cognito_user_id = 'MOCK'` for all users. The UUID lookup returned `None`, and the code crashed trying to subscript it.

```bash
# Fix: update local database to match real Cognito ID
psql $CONNECTION_URL -c \
  "UPDATE users SET cognito_user_id = '84286418-b0f1-70f4-d737-6829e77743a6' \
   WHERE handle = 'chrisfenton';"
```

> **Lesson:** Local seed data uses placeholder `MOCK` values for `cognito_user_id`. When testing with real Cognito authentication locally, you must manually update the local database to match your actual Cognito user ID from the JWT.

---

## Step 5: The DynamoDB Debugging Case Study

After fixing the Cognito ID mismatch, the Messages page stopped crashing but still showed no conversations. The backend returned HTTP 200 with `list_message_groups: []`. This began a systematic debugging process that ultimately revealed an infrastructure misconfiguration.

### Step 5a — Verify the frontend is sending authenticated requests

Checked Browser DevTools → Network tab. The GET request to `/api/message_groups` included a valid Authorization header and returned 200. Token refresh was working correctly.

### Step 5b — Check backend logs

```bash
docker logs aws-bootcamp-cruddur-2023-backend-flask-1 2>&1 | grep -A 10 "message_groups"
```

The logs showed: auth succeeded, PostgreSQL UUID lookup returned `94ffae78-4f08-423b-8254-75b09ff7cffc`, DynamoDB query constructed correctly, result: `list_message_groups: []` — empty but no error.

### Step 5c — Verify DynamoDB has data

```bash
aws dynamodb scan --table-name cruddur-messages \
  --endpoint-url http://localhost:8000 --query "Count"
# Result: 124 items
```

### Step 5d — Verify partition keys match

```bash
aws dynamodb scan --table-name cruddur-messages \
  --endpoint-url http://localhost:8000 \
  --filter-expression "begins_with(pk, :grp)" \
  --expression-attribute-values '{":grp": {"S": "GRP#"}}' \
  --projection-expression "pk" --query "Items[*].pk.S"
# Result: GRP#94ffae78-4f08-423b-8254-75b09ff7cffc  ← matches PostgreSQL UUID exactly
```

### Step 5e — Verify sort key format

```bash
# Result: sk = "2026-03-02T23:02:26.199550-05:00" — correct format, starts with 2026
```

**The turning point:** Everything checked out — data exists, keys match, format is correct. Yet the backend returns empty. This meant the backend was not querying the local DynamoDB at all.

### Step 5f — Check the backend's DynamoDB endpoint

```bash
docker exec aws-bootcamp-cruddur-2023-backend-flask-1 env | grep -i dynamo
docker exec aws-bootcamp-cruddur-2023-backend-flask-1 env | grep -i endpoint
# Result: No DynamoDB endpoint variable found.
```

### Root Cause

In `docker-compose.yml`, the `AWS_ENDPOINT_URL` was commented out:

```yaml
#AWS_ENDPOINT_URL: "http://dynamodb-local:8000" # DynamoDB Local URL
```

Without this variable, the boto3 SDK inside the Flask container defaulted to connecting to the real AWS DynamoDB service in us-east-1. That production table had no matching data, so the query returned a valid but empty result.

### The Fix

```yaml
# Uncomment in docker-compose.yml:
AWS_ENDPOINT_URL: "http://dynamodb-local:8000"
```

```bash
docker compose down && docker compose up
```

### Why This Was Hard to Find

| Characteristic | Why It Was Misleading |
|----------------|----------------------|
| HTTP 200 response | No error to trigger investigation — the backend genuinely succeeded |
| Valid empty array `[]` | Looks identical to "no conversations yet" — a legitimate state |
| No stack trace | Unlike the earlier NoneType crash, this produced zero errors |
| Commented-out line | The `#` character is easy to overlook in a dense YAML file |
| Works from terminal | `aws dynamodb scan --endpoint-url http://localhost:8000` works from host, creating false confidence |
| Two network contexts | Host uses `localhost:8000`, but backend container needs `dynamodb-local:8000` |

### What AWS_ENDPOINT_URL Does

| Scenario | AWS_ENDPOINT_URL | Where Queries Go |
|----------|-----------------|-----------------|
| Local development | `http://dynamodb-local:8000` | DynamoDB container on your machine |
| Production (ECS) | Not set | Real AWS DynamoDB in your region |
| Bug state (our issue) | Commented out | Real AWS DynamoDB — wrong data |

---

## Step 6: Verification — Everything Working

```bash
# Confirm the endpoint is now set
docker exec aws-bootcamp-cruddur-2023-backend-flask-1 env | grep -i dynamo
# AWS_ENDPOINT_URL=http://dynamodb-local:8000
```

| Feature | Status | Details |
|---------|--------|---------|
| Home feed | ✅ Working | Authenticated requests return activities |
| Notifications | ✅ Working | Migrated from Cookies to Amplify v6 |
| Crud posting | ✅ Working | ActivityForm creates posts successfully |
| Messages list | ✅ Working | `list_message_groups` returns conversation data |
| Message thread | ✅ Working | Full conversation with Aj-skynet displayed |
| Send message | ✅ Working | New message posted and visible |
| Token refresh | ✅ Working | `getAccessToken()` auto-refreshes expired tokens |

---

## Progress Checklist

- [x] Created centralized `getAccessToken()` utility
- [x] Migrated HomeFeedPage to shared token refresh
- [x] Migrated MessageGroupsPage to shared token refresh
- [x] Migrated MessageGroupPage to shared token refresh
- [x] Migrated MessageGroupNewPage to shared token refresh
- [x] Migrated MessageForm to shared token refresh
- [x] Migrated NotificationsFeedPage from Cookies to Amplify v6
- [x] Migrated UserFeedPage from Cookies to Amplify v6
- [x] Fixed seed.sql syntax error
- [x] Updated local cognito_user_id for testing
- [x] Debugged and fixed DynamoDB AWS_ENDPOINT_URL issue
- [x] Verified all features end-to-end locally
- [ ] Deploy updated frontend to ECS (rebuild image with new CheckAuth.js)
- [ ] Test token refresh in production (wait 1+ hours and verify)

---

---

# Recurring Pattern: Infrastructure Problems Disguised as Application Bugs

Both debugging sessions in this journal follow the same pattern — a visible application symptom whose true cause was an infrastructure misconfiguration. Recognizing this pattern early is what separates systematic cloud engineers from developers who debug by guessing.

| | Case Study 1: CORS (Week 6–7) | Case Study 2: DynamoDB (Week 6.5) |
|---|---|---|
| **Visible symptom** | CORS errors in browser console | Empty Messages page, no errors |
| **Suspected cause** | Flask CORS configuration | Token refresh code or DynamoDB data |
| **Actual cause** | Missing ALB routing rule for `/api/*` | Commented-out `AWS_ENDPOINT_URL` |
| **Failure layer** | Infrastructure (ALB) | Infrastructure (Docker env vars) |
| **Why misleading** | Browser said "CORS error" but wrong server was responding | Backend said 200 OK but queried wrong DynamoDB |
| **Key diagnostic** | `curl -v` revealed nginx responding instead of Flask | `docker exec env` revealed no endpoint variable |

> **The Universal Takeaway:** When something doesn't work in a multi-service architecture, always ask: *"Is my request even reaching the right service?"* Check environment variables, network paths, and endpoint configuration before debugging application logic.

---

## Key Learnings Across Both Sessions

### 1. Centralize shared logic
Having every component duplicate token retrieval code means every component can break independently. A single shared function means one place to fix and test.

### 2. `fetchAuthSession()` handles refresh internally
The Amplify v6 SDK checks token expiration and refreshes automatically when needed. No need to force refresh on every page load.

### 3. Local seed data diverges from production
Seed data uses `MOCK` placeholders for `cognito_user_id`. When testing with real Cognito auth locally, you must sync the IDs manually using `psql`.

### 4. Terminal commands don't equal container commands
Running `aws dynamodb scan --endpoint-url http://localhost:8000` from your terminal works because `localhost:8000` maps to the DynamoDB container's published port. But the Flask container inside Docker needs `http://dynamodb-local:8000` (the Docker Compose service name) because containers communicate over Docker's internal network, not through published host ports.

### 5. Silent failures are the hardest to debug
A 500 error with a stack trace points you directly to the problem. A 200 with empty data forces you to systematically verify every layer of the stack.

### 6. Always verify environment variables inside the container
Your `docker-compose.yml` might look correct, but a commented-out line, a typo, or a stale container could mean the running environment doesn't match your config. Always verify with `docker exec <container> env`.

---

## Commands Reference

### ECS / Production

```bash
# SSH into a running ECS Fargate container
aws ecs execute-command --cluster cruddur \
  --task $(aws ecs list-tasks --cluster cruddur --service-name backend-flask \
    --query "taskArns[0]" --output text) \
  --container backend-flask --interactive --command "/bin/sh"

# Check env vars in container
  --command "/bin/sh -c 'env | grep -E \"FRONTEND|BACKEND\"'"

# Register + deploy new task definition
aws ecs register-task-definition \
  --cli-input-json file://aws/json/task-definitions/backend-flask.json
aws ecs update-service --cluster cruddur --service backend-flask \
  --task-definition backend-flask --force-new-deployment

# Test CORS preflight
curl -X OPTIONS https://api.fentoncruddur.com/api/activities/home \
  -H "Origin: https://fentoncruddur.com" \
  -v 2>&1 | grep -E "< |server:"
```

### Docker / Local

```bash
# Re-authenticate with ECR (required each new Codespace session)
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  931637612335.dkr.ecr.us-east-1.amazonaws.com

# Check env vars inside a running container
docker exec <container-name> env | grep -i dynamo

# Update cognito_user_id for local testing
psql $CONNECTION_URL -c \
  "UPDATE users SET cognito_user_id = '<your-cognito-sub>' \
   WHERE handle = 'chrisfenton';"

# Count items in local DynamoDB
aws dynamodb scan --table-name cruddur-messages \
  --endpoint-url http://localhost:8000 --query "Count"

# List GRP# partition keys
aws dynamodb scan --table-name cruddur-messages \
  --endpoint-url http://localhost:8000 \
  --filter-expression "begins_with(pk, :grp)" \
  --expression-attribute-values '{":grp": {"S": "GRP#"}}' \
  --projection-expression "pk" --query "Items[*].pk.S"
```
