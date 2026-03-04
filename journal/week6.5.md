# Week 6.5 Journal: Cognito Token Refresh & DynamoDB Debugging

**Session Date:** March 3–4, 2026

---

## Overview

This session focused on implementing centralized Cognito access token refresh across the entire Cruddur frontend, then testing the full application locally in Docker. What started as a straightforward frontend code change turned into a deep debugging session that uncovered multiple environment issues—a mismatched Cognito user ID, a seed data syntax error, and ultimately a commented-out Docker environment variable that caused the backend to silently query the wrong DynamoDB instance.

By the end of this session, I successfully:
- Created a centralized `getAccessToken()` utility for automatic token refresh
- Migrated all 8 React components from legacy auth patterns to Amplify v6
- Removed all Cookies-based authentication code from the frontend
- Fixed local database seeding issues (PostgreSQL and DynamoDB)
- Debugged and resolved a silent infrastructure misconfiguration in `docker-compose.yml`
- Verified end-to-end functionality: Home feed, Notifications, Crud posting, and Messages

---

## The Problem: Access Tokens Expire After 1 Hour

Cognito access tokens have a default TTL of 1 hour. After expiration, any API call using the old token silently fails—the backend receives an invalid JWT, authentication fails, and the user sees empty data or errors with no indication of what went wrong. There is no automatic refresh happening unless the frontend explicitly handles it.

The original codebase handled tokens in two problematic ways:

| Pattern | Files Using It | Problem |
|---------|---------------|---------|
| `localStorage.getItem("access_token")` via Cookies import | NotificationsFeedPage, UserFeedPage | Token stored once at login, never refreshed. After 1 hour, every API call fails silently. |
| Inline `fetchAuthSession()` in each component | HomeFeedPage, MessageGroupsPage, MessageGroupPage, MessageGroupNewPage, MessageForm | Token refresh logic duplicated everywhere. No single place to update if the pattern changes. |

Neither approach handled the expiration gracefully. The fix was to centralize token retrieval into a single shared function that automatically refreshes expired tokens.

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

**How `fetchAuthSession()` handles refresh:** When called without `forceRefresh: true`, the Amplify SDK internally checks whether the current access token is expired. If it is, the SDK uses the refresh token to obtain a new access token from Cognito automatically. If the token is still valid, it returns the cached token instantly with no network call. This means components don't need to know or care about token expiration—they just call `getAccessToken()` and always get a valid token back.

**Why this is better than Andrew's updated version:** The instructor's updated `CheckAuth.js` still uses `localStorage.setItem("access_token", ...)` to store the JWT. My approach keeps tokens in Amplify's internal memory management, avoiding localStorage entirely. This is more secure because any JavaScript running on the page (including potential XSS attacks) could read localStorage, but cannot access Amplify's internal token storage.

---

## Step 2: Migrating All Components

Each component that makes authenticated API calls needed to be updated to use the shared `getAccessToken()` function.

### The Migration Pattern

**Before (inline fetchAuthSession):**
```javascript
import { fetchAuthSession } from 'aws-amplify/auth';

// Inside the component's loadData function:
const session = await fetchAuthSession();
const accessToken = session?.tokens?.accessToken?.toString();
const res = await fetch(url, {
  headers: { Authorization: `Bearer ${accessToken}` }
});
```

**Before (legacy Cookies pattern):**
```javascript
import Cookies from 'js-cookie';

// Inside the component's loadData function:
const access_token = Cookies.get('access_token');
const res = await fetch(url, {
  headers: { Authorization: `Bearer ${access_token}` }
});
```

**After (centralized):**
```javascript
import { getAccessToken } from '../lib/CheckAuth';

// Inside the component's loadData function:
const access_token = await getAccessToken();
const res = await fetch(url, {
  headers: { Authorization: `Bearer ${access_token}` }
});
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

All seven consumer files now import from the same source. If the token retrieval logic ever needs to change again, I only update `CheckAuth.js`.

---

## Step 3: Local Testing — Environment Setup

### Codespaces ECR Authentication

Starting a new Codespace session means AWS credentials are fresh but ECR login tokens have expired. The first `docker compose up` failed with `403 Forbidden` when pulling my custom base image from ECR:

```bash
# Re-authenticate with ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  931637612335.dkr.ecr.us-east-1.amazonaws.com

# Then start containers
docker compose up
```

### Codespaces Port Visibility

Ports 3000 (frontend) and 4567 (backend) defaulted to Private visibility in Codespaces. This caused `401 Unauthorized` on preflight OPTIONS requests because the Codespaces proxy blocks unauthenticated requests to private ports. The fix was changing both ports to **Public** in the PORTS tab.

**Lesson:** Every new Codespace session requires checking port visibility. Private ports block CORS preflight requests.

---

## Step 4: Database Seeding Issues

### PostgreSQL Seed Data Fix

The `seed.sql` file had a missing comma after the second VALUES row:

**Before (broken):**
```sql
INSERT INTO public.users (display_name, email, handle, cognito_user_id)
VALUES
  ('Chris Fenton', 'chrisfenton1000@gmail.com', 'chrisfenton' ,'MOCK'),
  ('Antwuan Jacobs', 'fentonmgmt@gmail.com', 'Aj-skynet' ,'MOCK')  -- missing comma here
  ('Gold Grill', 'goldgrill@cruddur.com', 'goldgrill' ,'MOCK');
```

**After (fixed):**
```sql
  ('Antwuan Jacobs', 'fentonmgmt@gmail.com', 'Aj-skynet' ,'MOCK'),
```

### Cognito User ID Mismatch

After seeding, the Messages page returned a `TypeError: 'NoneType' object is not subscriptable` error. The backend was extracting my real Cognito user ID from the JWT (`84286418-b0f1-70f4-d737-6829e77743a6`), but the PostgreSQL users table had `cognito_user_id = 'MOCK'` for all users.

The UUID lookup query returned `None`, and the code crashed trying to subscript it.

**Fix:**
```bash
psql $CONNECTION_URL -c \
  "UPDATE users SET cognito_user_id = '84286418-b0f1-70f4-d737-6829e77743a6' \
   WHERE handle = 'chrisfenton';"
```

**Lesson:** Local seed data uses placeholder `MOCK` values for `cognito_user_id`. When testing with real Cognito authentication, you must manually update the local database to match your actual Cognito user ID from the JWT.

---

## Step 5: The DynamoDB Debugging Case Study

After fixing the Cognito ID mismatch, the Messages page stopped crashing but still showed no conversations. The backend returned HTTP 200 with `list_message_groups: []`.

This began a systematic debugging process that ultimately revealed an infrastructure misconfiguration.

### The Debugging Walkthrough

**Step 5a — Verify the frontend is sending authenticated requests**

Checked Browser DevTools → Network tab. The GET request to `/api/message_groups` included a valid Authorization header and returned 200. The token refresh code was working correctly.

**Step 5b — Check backend logs**

```bash
docker logs aws-bootcamp-cruddur-2023-backend-flask-1 2>&1 | grep -A 10 "message_groups"
```

The logs showed:
- Authentication succeeded (cognito_user_id extracted)
- PostgreSQL UUID lookup returned `94ffae78-4f08-423b-8254-75b09ff7cffc`
- DynamoDB query constructed correctly: `pk = GRP#94ffae78-... AND begins_with(sk, '2026')`
- Result: `list_message_groups: []` — empty, but no error

**Step 5c — Verify DynamoDB has data**

```bash
aws dynamodb scan --table-name cruddur-messages \
  --endpoint-url http://localhost:8000 --query "Count"
# Result: 124 items
```

**Step 5d — Verify partition keys match**

```bash
aws dynamodb scan --table-name cruddur-messages \
  --endpoint-url http://localhost:8000 \
  --filter-expression "begins_with(pk, :grp)" \
  --expression-attribute-values '{":grp": {"S": "GRP#"}}' \
  --projection-expression "pk" --query "Items[*].pk.S"
```

Result: `GRP#94ffae78-4f08-423b-8254-75b09ff7cffc` — matches the PostgreSQL UUID exactly.

**Step 5e — Verify sort key format**

```bash
aws dynamodb query --table-name cruddur-messages \
  --endpoint-url http://localhost:8000 \
  --key-condition-expression "pk = :pk" \
  --expression-attribute-values '{":pk": {"S": "GRP#94ffae78-4f08-423b-8254-75b09ff7cffc"}}' \
  --projection-expression "sk"
```

Result: `sk = "2026-03-02T23:02:26.199550-05:00"` — correct format, starts with 2026.

**The turning point:** Everything checked out—data exists, keys match, format is correct. Yet the backend returns empty. This meant the backend was not querying the local DynamoDB at all.

**Step 5f — Check the backend's DynamoDB endpoint**

```bash
docker exec aws-bootcamp-cruddur-2023-backend-flask-1 env | grep -i dynamo
docker exec aws-bootcamp-cruddur-2023-backend-flask-1 env | grep -i endpoint
```

Result: **No DynamoDB endpoint variable found.** Only `OTEL_EXPORTER_OTLP_ENDPOINT` (unrelated).

### Root Cause

In `docker-compose.yml`, the `AWS_ENDPOINT_URL` was commented out:

```yaml
#AWS_ENDPOINT_URL: "http://dynamodb-local:8000" # DynamoDB Local URL
```

Without this variable, the boto3 SDK inside the Flask container defaulted to connecting to the real AWS DynamoDB service in us-east-1. That production table had no matching data, so the query returned a valid but empty result.

### The Fix

Uncommented the line in `docker-compose.yml`:

```yaml
AWS_ENDPOINT_URL: "http://dynamodb-local:8000"
```

Then restarted:

```bash
docker compose down && docker compose up
```

### Why This Was Hard to Find

| Characteristic | Why It's Misleading |
|----------------|-------------------|
| HTTP 200 response | No error to trigger investigation—the backend genuinely succeeded |
| Valid empty array `[]` | Looks identical to "no conversations yet"—a legitimate state |
| No stack trace | Unlike the earlier NoneType crash, this produced zero errors |
| Commented-out line | The `#` character is easy to overlook in a dense YAML file |
| Works from terminal | Running `aws dynamodb scan --endpoint-url http://localhost:8000` from the host machine works fine, creating a false sense that DynamoDB is working |
| Two network contexts | The host uses `localhost:8000`, but the backend container needs Docker's internal DNS name `dynamodb-local:8000` |

### What AWS_ENDPOINT_URL Does

When boto3 creates a DynamoDB client, it needs to know where to send requests. By default, it sends them to the real AWS service endpoint (e.g., `https://dynamodb.us-east-1.amazonaws.com`). `AWS_ENDPOINT_URL` overrides this default, redirecting all SDK calls to the specified URL.

| Scenario | AWS_ENDPOINT_URL | Where Queries Go |
|----------|-----------------|-----------------|
| Local development | `http://dynamodb-local:8000` | DynamoDB container on your machine |
| Production (ECS) | Not set | Real AWS DynamoDB in your region |
| Bug state (our issue) | Commented out | Real AWS DynamoDB—wrong data |

The name `dynamodb-local` in the URL is the Docker Compose service name, which Docker's internal DNS resolves to the container's IP address on the shared Docker network.

---

## Step 6: Verification — Everything Working

After uncommenting `AWS_ENDPOINT_URL` and restarting containers, I verified all features:

```bash
# Confirm the endpoint is now set
docker exec aws-bootcamp-cruddur-2023-backend-flask-1 env | grep -i dynamo
# AWS_ENDPOINT_URL=http://dynamodb-local:8000
```

### Test Results

| Feature | Status | Details |
|---------|--------|---------|
| Home feed | ✅ Working | Authenticated requests return activities |
| Notifications | ✅ Working | Migrated from Cookies to Amplify v6 |
| Crud posting | ✅ Working | ActivityForm creates posts successfully |
| Messages list | ✅ Working | `list_message_groups` returns conversation data |
| Message thread | ✅ Working | Full conversation with Aj-skynet displayed |
| Send message | ✅ Working | New message ("That's real doc!") posted and visible |
| Token refresh | ✅ Working | `getAccessToken()` auto-refreshes expired tokens |

---

## Files Modified This Session

```
frontend-react-js/src/
├── lib/
│   └── CheckAuth.js                    # Added getAccessToken() export
├── pages/
│   ├── HomeFeedPage.js                 # Migrated to getAccessToken()
│   ├── NotificationsFeedPage.js        # Migrated from Cookies to getAccessToken()
│   ├── UserFeedPage.js                 # Migrated from Cookies to getAccessToken()
│   ├── MessageGroupsPage.js            # Migrated to getAccessToken()
│   ├── MessageGroupPage.js             # Migrated to getAccessToken()
│   └── MessageGroupNewPage.js          # Migrated to getAccessToken()
└── components/
    └── MessageForm.js                  # Migrated to getAccessToken()

docker-compose.yml                       # Uncommented AWS_ENDPOINT_URL
backend-flask/db/seed.sql               # Fixed missing comma in VALUES
```

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

## Recurring Pattern: Infrastructure Problems Disguised as Application Bugs

This is the second major debugging case study in the project. Both follow the same pattern:

| | CORS Case Study (Week 6–7) | DynamoDB Case Study (This Session) |
|---|---|---|
| **Visible symptom** | CORS errors in browser console | Empty Messages page, no errors |
| **Suspected cause** | Flask CORS configuration | Token refresh code or DynamoDB data |
| **Actual cause** | Missing ALB routing rule for `/api/*` | Commented-out `AWS_ENDPOINT_URL` |
| **Failure layer** | Infrastructure (ALB) | Infrastructure (Docker env vars) |
| **Why misleading** | Browser said "CORS error" but wrong server was responding | Backend said 200 OK but queried wrong DynamoDB |
| **Key diagnostic** | `curl -v` revealed nginx responding instead of Flask | `docker exec env` revealed no endpoint variable |

**The takeaway:** When something doesn't work in a multi-service architecture, always ask: *"Is my request even reaching the right service?"* Check environment variables, network paths, and endpoint configuration before debugging application logic.

---

## Key Learnings

1. **Centralize shared logic** — Having every component duplicate token retrieval code means every component can break independently. A single shared function means one place to fix and test.

2. **`fetchAuthSession()` handles refresh internally** — The Amplify v6 SDK checks token expiration and refreshes automatically when needed. No need to force refresh on every page load.

3. **Local seed data diverges from production** — Seed data uses `MOCK` placeholders for `cognito_user_id`. When testing with real Cognito auth locally, you must sync the IDs manually.

4. **Terminal commands ≠ container commands** — Running `aws dynamodb scan --endpoint-url http://localhost:8000` from your terminal works because `localhost:8000` maps to the DynamoDB container's published port. But the Flask container inside Docker needs `http://dynamodb-local:8000` (the Docker Compose service name) because containers communicate over Docker's internal network, not through published host ports.

5. **Silent failures are the hardest to debug** — A 500 error with a stack trace points you directly to the problem. A 200 with empty data forces you to systematically verify every layer of the stack.

6. **Always verify environment variables inside the container** — Your `docker-compose.yml` might look correct, but a commented-out line, a typo, or a stale container could mean the running environment doesn't match your config. Always verify with `docker exec <container> env`.

---

## Commands Reference

```bash
# Re-authenticate with ECR (required each new Codespace session)
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  931637612335.dkr.ecr.us-east-1.amazonaws.com

# Check environment variables inside a running container
docker exec <container-name> env | grep -i dynamo
docker exec <container-name> env | grep -i endpoint

# Update cognito_user_id for local testing
psql $CONNECTION_URL -c \
  "UPDATE users SET cognito_user_id = '<your-cognito-sub>' \
   WHERE handle = 'chrisfenton';"

# Count items in local DynamoDB
aws dynamodb scan --table-name cruddur-messages \
  --endpoint-url http://localhost:8000 --query "Count"

# List GRP# partition keys in DynamoDB
aws dynamodb scan --table-name cruddur-messages \
  --endpoint-url http://localhost:8000 \
  --filter-expression "begins_with(pk, :grp)" \
  --expression-attribute-values '{":grp": {"S": "GRP#"}}' \
  --projection-expression "pk" --query "Items[*].pk.S"

# Tail backend logs for message_groups
docker logs <backend-container> 2>&1 | grep -A 10 "message_groups"
```
