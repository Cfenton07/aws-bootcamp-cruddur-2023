# Week 15 — From Beta to Hardened: Persistent Replies, Threading, a Full Repo Audit, and Three Verified Pilots (Sept 7 – Oct 2, 2026)

Week 14 ended with Cruddur beta-ready: multi-user correctness, user discovery, and the first production deploy exercised by two real accounts. This entry covers the four weeks after that, which changed how I work as much as what the app does. The headline numbers: **three production pilots, all passing**; **a 49-finding repo audit triaged and its critical and high-priority items fixed**; **four PRs merged to `main` (#15, #17, #18, #19), with tonight's two commits queued for the next one**; and a reusable test harness that checks the real application code rather than my assumptions about it.

The working model held steady throughout, and got sharper: **Claude writes and tests the specs, Kiro authors the files under the Kiro Supervised protocol, and I run every git, AWS and Docker command and accept each change only after the verification gates pass.**

---

## Where things stood vs. where they stand now

| Area | End of Week 14 | October 2 |
|---|---|---|
| Replies | Rendered once, vanished on refresh (fabricated in Python, never written to Postgres) | Persisted, single-level threads, `replies_count` correct, "View N more replies" |
| Feed | Clipped at the viewport; no scrolling anywhere | Centre column scrolls; rails fixed |
| Messages | Purple circles for every avatar | Real photos in the group list **and** the conversation pane; initial fallback that actually looks like a circle |
| Security | Bearer tokens, request headers and SQL params written to CloudWatch on every request; any logged-in user could read any DM by UUID; API echoed any website's origin | Zero token/header/SQL logging (verified in CloudWatch); non-members get 404; CORS restricted to `fentoncruddur.com` and proven by test |
| Teardown | Deleted RDS with `--skip-final-snapshot` and no guard | Refuses to delete RDS without a manual snapshot ≤ 90 minutes old, and refuses while dependent stacks still exist |
| Error handling | Bad input → HTML 500; failed writes → silent 200 `{}` | 400/404/422 with JSON error codes |
| Migrations | Variable-width stamps that could silently skip a migration | Fixed-width prefixes, numeric sort, runner stops on failure |
| Testing | Manual browser checks | `bin/smoke-test` (12 checks) and `bin/cors-probe` (19 checks against the real `app.py`) |
| Deploy evidence | One verified pilot | Three verified pilots, each with digests recorded from two sources |

---

## Sept 7 — Replies persist, and the August incident is closed for good

**What:** `CreateReply` had been fabricating a UUID, a display name and a timestamp in Python and returning them without touching Postgres. The route also hardcoded `user_handle = 'chrisfenton'`, so every reply was attributed to me. Commit `ab1138c` added `create_reply.sql`, persisted through `db.query_commit`, verified the Cognito JWT, and used `claims['sub']`. Activity `eb5f6f31` carried two replies that survived a hard refresh.

**The August incident closed:** a live signup canary ran Cognito → Lambda (in VPC) → Secrets Manager → security-group chain → RDS insert in **1.2 seconds**. In August that same path produced four consecutive timeouts. The secret ARN had rotated twice with no config change, which is exactly why it's derived from stack exports.

**Also shipped:** `bin/smoke-test` (12 passed / 0 failed / 1 skipped against live infrastructure). Migration runner fix `2fe0914`: the stored stamp was `str(time.time())`, which has a variable digit count, so a newer migration could compare *smaller* and be skipped with no error. Migration `17800000000000000` changed `reply_to_activity_uuid` from integer to uuid.

**What I learned:** placeholders in copy-pasteable commands are a trap (`@<newhandle>` made bash read `<` as a redirect), and `local x=$(cmd)` destroys `$?`.

## Sept 9 — The feed that didn't scroll

`a6f005f`. Root cause: `body` was `overflow: hidden` (added for the glow animation) and nothing on the home page had `overflow: auto`, so the feed was clipped with no scroll anywhere. My own backlog had claimed the column already scrolled and only the last post was clipped. That was wrong, and I corrected the record.

Kiro hit a gate that contradicted the spec's own content (a comment containing the word `overflow`) and **reported the failure instead of editing the comment to force a pass.** That became a recurring theme of these four weeks.

## Sept 19 — Threading policy, and pilot #1

**Decision:** single-level nesting. Replies to replies were being written and then becoming invisible, because no query returned them. Rather than build recursive threads, I enforced one level in three places: the UI redirects a reply-to-a-child to the root, the SQL resolves any target to its root, and the feed shows children under roots only.

- `9a0353f` threading UI (40px child avatars, 14px type, left rule; reply on a child opens the form against the root).
- `3ec822f` threading backend: `create_reply.sql` became one statement with three CTEs (`target` resolves the root, `inserted` uses INSERT…SELECT so a bad UUID inserts zero rows and fails loudly, `bumped` increments `replies_count`). `home.sql` uses `LEFT JOIN LATERAL … LIMIT 3`. LATERAL is what permits a per-row limit. Backfill migration `17800000000000001`.

**Pilot #1: 12/12 checks passed.** Deploy about 34 minutes, teardown about 52, total about 2.5 hours. New check added: no unattached Elastic IPs after teardown.

**The insight I keep coming back to:** the UI redirect **masked** the SQL guard. Every UI reply already sent the root UUID, so `COALESCE` had nothing to correct. Only a direct API call aimed at a child proved the server-side enforcement. **Test the layer you claim, not the layer in front of it.** That lesson came back twice more this month.

## Sept 25–26 — Avatars in Messages, "View N more replies", and pilot #2

- **Cost check:** September month-to-date $2.36. The idle baseline is about $1.80/month (the KMS key at $1 plus snapshot storage). Deployed time costs about $0.13/hour, so a pilot costs about $0.30.
- `b84a463`: DynamoDB message groups don't carry `cognito_user_id`. Instead of changing the item shape (which would need a backfill), I enrich at read time with **one** Postgres query for every handle on the page (`handle = ANY(...)`). `ProfileAvatar` gained a `name` prop and an initial fallback.
- `cebcc3e`: public `GET /api/activities/<uuid>/replies` (400 on a malformed UUID, `[]` on an unknown one, LIMIT 100 safety cap).

**Pilot #2 passed.** #9 was 8/8, and #11 was 5/6 with one check not exercised. Logs showed exactly **one** users lookup per request, with de-duplicated handles. Findings logged: the conversation pane still showed purple circles, every request was logged at ERROR level, and a stray $0.01 CodeBuild charge was traced to a leftover log group.

**Lesson:** gates that grep exact code lines with `grep -F` produced the first all-green run (19/19). I've written them that way ever since.

## Sept 28 — The repo audit, and choosing fixes over features

I had Kiro run a read-only audit of the whole repository: **1 critical, 8 high, 22 medium and 18 low findings.** I didn't treat it as gospel. Every finding was verified with file and line evidence, then confirmed, downgraded or escalated. HIGH-07 got *escalated*, because it affected my own build path.

**The decision: fixes first.** The planned likes feature would have been built on exactly the broken code paths (`lib/db.py`, token logging, the migration prefix). Building features first would have meant reworking the same lines twice, and a failure in a combined pilot would have been impossible to attribute.

Four specs, run one at a time in separate Kiro sessions with a commit between each:

| Commit | What it fixed |
|---|---|
| `c4e8238` Ops safety | **CRIT-01:** teardown now requires a manual snapshot ≤ 90 minutes old (or creates one), and refuses while CrdAuth/CrdFrontend/CrdService still exist. **HIGH-07:** the frontend build never passed the API Gateway URL into the image, so avatar upload had nowhere to send files. Also `pipefail`, an empty-value guard, and `.dockerignore` for both images. |
| `e5f96e1` Security | **HIGH-02:** removed bearer-token, header, SQL-parameter and PII logging. **HIGH-01:** `Ddb.is_member` checks the base table with ConsistentRead, no Limit, and pagination. A non-member gets **404, not 403**, so the API doesn't even confirm the conversation exists. |
| `b0f4d23` Hardening | `query_commit` returns True/None correctly instead of crashing on zero rows; migrate stops on failure; reply 400/404; INFO-level request logging; a stable avatar cache key. |
| `c1a3dda` Hardening 2 | Failed activity and profile writes return 422 instead of a silent 200. Kiro caught `update_profile` as a missed call site. Fixed-width migration prefix plus numeric sort. setup now runs migrate. |

**How the specs were tested before Kiro ever saw them:** a stub `aws` CLI simulated seven teardown scenarios (zero deletes in every abort case), a fake DynamoDB client exercised the membership check (including a member found on page 2), and **a real PostgreSQL 16** loaded `schema.sql` twice to prove the stamp reset.

**Why the membership check uses the base table and not the GSI:** a GSI is eventually consistent. A brand-new conversation could return a false 404 for its own participants. Correctness beat convenience there.

**Conventions established:** migrations are data-only; every new migration is also folded into `schema.sql` with the stamp bumped; SQL tracing is off in ECS unless `CRUDDUR_SQL_DEBUG=1`; commit subjects start with the spec name, because the next spec's STOP 0 checks for it.

## Sept 29 — Conversation avatars, and pilot #3

The conversation-avatars spec written on Sept 26 had never been saved to the repo (and neither had the likes and sidebar specs). It only existed as a lost download. I rewrote it against the post-security code: `5ffff24` reuses the one-query enrichment pattern, runs it **after** the membership check so a non-member never triggers it, fixes the `/messages/@handle` link to `/@handle` (MED-04), and fixes a `classsName` typo.

**Pilot #3 shipped all five commits at once, and it passed:**

- Both images built. Digests were confirmed by the push output *and* ECR. The frontend build printed the API Gateway URL for the first time (HIGH-07 working).
- deploy-all took about 33 minutes; auth-deploy packaged new Lambda code (a new content hash means new code).
- Smoke test 12/0/1. The backend build context was only 63.88 kB, so `.dockerignore` was doing its job without excluding anything the app needed.
- **Signup** as a brand-new user: the post-confirmation Lambda logged only `sub` and handle, with no email or user dump, in 1.19 seconds.
- **IDOR closed in production:** the new user opening my conversation's URL got a **404** and saw nothing.
- **CloudWatch:** 0 hits each for "Auth header", "Headers:" and "SQL Params". As a positive control, I counted a line I *knew* should exist (`list_messages`: 9 hits). **A zero only means something if you've proven the search can find a non-zero.**
- Reply 400/404 passed with a real JWT, on the third try. My first two token extractions failed, and the failed attempts exposed a real bug: a malformed token returns 500 instead of 401.
- **The CRIT-01 teardown gate worked on its first real run:** it found the 5-minute-old snapshot and let teardown proceed.

**One finding failed:** a CORS probe with `Origin: https://evil.example` came back with `access-control-allow-origin: https://evil.example`. The API was echoing whatever origin asked. The impact was limited, because auth uses a bearer header and not cookies, but it contradicted the config.

## October 2 — Tonight: PR #19, the CORS fix, and avatar fallbacks

### PR #19
All five pilot-#3 commits were merged to `main` as `d3b09fb`, with a merge commit so each fix stays readable as its own story.

### CORS: the bug I'd have shipped, and the test that caught it
**Diagnosis:** eight routes carried a bare `@cross_origin()`. In flask-cors 6.0.5, that decorator *replaces* the app-wide allow-list for its route with the defaults: any origin, echoed back. I proved it inside my own backend image with a small Flask app: decorated route → echoes evil; undecorated route → allows the real site, gives evil nothing.

**Rev 1 of the fix just removed the decorators. Kiro stopped it before editing anything.** Kiro built its own test with real route bodies and found what my test hadn't: the decorator was secretly doing **two** jobs. It also answered CORS preflights *before* the route code ran. Five routes listed `'OPTIONS'` in their methods without handling it. Without the decorator, Flask runs the real route code on the preflight, and a preflight carries no token and no JSON body. Result: **401 or 415 on opening a conversation, sending a DM, replying and editing a bio.** Browsers reject any preflight that isn't 2xx, even when the origin header is right.

My test had only checked **headers**. My test route returned `"ok"`, so it could never show a bad **status code**. It was the pilot-#1 lesson again, and this time I was the one testing the layer in front.

**Rev 2 (`3fc283e`):** remove all eight decorators, *and* drop `'OPTIONS'` from the five routes that don't handle it, so Flask answers preflights itself (the way `/api/message_groups` already worked). The two routes that return 204 for OPTIONS keep it.

**The real fix was the test.** I wrote `bin/cors-probe`, now committed as executable. It mounts the **real working-tree `app.py`** read-only into the pinned backend image, with networking off, fakes only the Cognito key download, and sends a preflight from the real site and from `evil.example` to every browser-called route. It checks **status and headers** for all 19 cases. It had to work through two layers of reality first: the app downloads Cognito's signing keys at import time (so the probe hands it an empty key list), and `config.toml` turned out to have Windows line endings (so the image lookup was loosened). Result:

```
PROBE ok   POST /api/profile/update   https://fentoncruddur.com  200 ACAO=https://fentoncruddur.com
PROBE ok   POST /api/profile/update   https://evil.example       200 ACAO=None
...
PROBE RESULT: PASS
```

### Avatar fallbacks (`b680d9a`)
Pilot #3's new no-photo user showed the "initial" fallback as a **wide pill** in the sidebar and a **sliver** on the profile page. **Root cause: a CSS specificity tie.** `ProfileInfo.css` *did* size the avatar at 40px, but the shared fallback rule (`.profile-avatar:has(.avatar-fallback)`, width/height 100%) has the same specificity, because `:has()` takes its argument's weight. **When two rules tie, the file loaded last wins**, and it loaded last. The fix adds a three-class rule in each context, so it wins regardless of load order. The shared component's CSS is left untouched, so the places that already worked can't regress. Also: `name` is passed in three components that were missing it (fallback showed `?`), and the new-conversation entry finally renders an avatar.

### Tonight's numbers
2 commits, 1 PR merged, about 54 Kiro credits (including a 19.9-credit run that stopped and saved me from four broken features), and 0 AWS spend.

---

## What I learned

- **Test the layer you claim.** This came up three times: the UI redirect hid the SQL guard (pilot #1), a header-only test hid broken preflight status codes (tonight), and a stub route hid how real route bodies behave. The durable fix is a test that runs the real thing.
- **A decorator can do more than its name says.** `@cross_origin()` both widened the origin policy *and* handled preflights. Removing it for the first reason silently removed the second. Before deleting something, list every job it does.
- **Positive controls make zeros meaningful.** "0 matches" proves nothing until a known-present pattern returns non-zero from the same search.
- **An agent stopping is a feature.** Kiro stopped four times in this period instead of working around a failed check: the overflow comment, the `update_profile` silent-200, the CORS preflight regression, and a spec file that reappeared because an open editor tab re-saved it. Each stop cost a few credits and saved a broken deploy. **A check is a proxy for an intent; when the proxy and the intent disagree, a human makes the call.**
- **Fixes before features** when the features sit on the broken code. It also keeps pilots attributable: one class of change per pilot.
- **Verify state transitions, don't assume them.** This week-13 principle now runs through the teardown gate, the two-source digest check, and the snapshot pointer grep.
- **Failed attempts are data.** Two botched token extractions surfaced a real 500-instead-of-401 bug that a clean first try would have missed.

## Open items

- **Likes spec** (rewrite; the Sept 26 version was lost): likes table + migration `17800000000000002`, POST `/like` and `/unlike`, `liked_by_me`, heart toggle. Bump the `schema.sql` stamp. **Don't add `'OPTIONS'` to new routes**, and add them to `bin/cors-probe`.
- **Sidebar spec** (rewrite): `/api/users/suggested`, `/api/trending`. Add `users.cognito_user_id` to `activities/users/short.sql` so the new-conversation entry shows a photo instead of an initial.
- **Pilot #4:** CORS (curl *with* status codes), avatar fallbacks with a fresh no-photo signup, likes (migrate first), sidebar.
- upload-avatar and lambda-authorizer Lambdas still run old code. They're outside CloudFormation, so the logging fixes are repo-only. Redeploy with a scripted zip-with-dependencies; long term, the IaC epic.
- `message_groups.py` still prints group data (names, last message text): the security-2 logging sweep.
- A malformed bearer token returns 500 instead of 401.
- Avatar needs a page reload after upload (async processing plus a per-load cache key).
- `ddb.py` year-prefix bug: **must be fixed before Dec 31, 2026.**
- Observability epic (OTEL, X-Ray, watchtower) and IaC epic (DynamoDB, Lambdas, API Gateway, CodeBuild).