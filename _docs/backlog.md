# Cruddur — Backlog

**Last updated:** August 5, 2026 (after PR #13, Week 14 deploy)
**Purpose:** Tracked work items, tiered by whether they block a closed beta (10–30 invited users). Entries are written to be specific enough to hand to Kiro as authoring tasks — each names the files involved, the observed behavior, and the intended change. Anything marked **needs discovery** requires reading the named file before authoring, because the exact implementation wasn't verified when the item was logged.

---

## Tier 1 — Blocks closed beta

### 1.1 Reply persistence (P0)

**Observed:** Clicking the reply icon on a crud opens a modal with a text area and a Reply button. Submitting appears to do nothing — the reply never appears and does not survive a refresh.

**Cause:** `backend-flask/services/create_reply.py` is a bootcamp mock. It validates input and then constructs a fake response object in memory (including a hardcoded `'display_name': 'Chris Fenton'`) and returns it. It never writes to the database. Additionally, `backend-flask/app.py` route `data_activities_reply` still hardcodes `user_handle = 'chrisfenton'` — this is the one remaining hardcoded identity in the codebase, deliberately left out of scope during Tasks A–F.

**Blocking issue:** the `activities` table declares `reply_to_activity_uuid integer` in `backend-flask/db/schema.sql`, but activity UUIDs are `UUID` type. The column cannot hold the value it is named for. This requires a migration, not just a service rewrite.

**Work required:**
1. **Migration** — add a migration under `backend-flask/db/migrations/` following the pattern of the existing `*_add_bio_column.py`, altering `activities.reply_to_activity_uuid` from `integer` to `UUID`. Also update `backend-flask/db/schema.sql` so fresh local setups match. Note `schema-load` is destructive and used for initial setup only; `migrate` is the safe path for existing databases.
2. **New SQL** — create `backend-flask/db/sql/activities/create_reply.sql` performing an INSERT into `public.activities` with `user_uuid` resolved by `WHERE users.cognito_user_id = %(cognito_user_id)s` (mirror `create.sql`), plus `message`, `reply_to_activity_uuid`, and `expires_at`, with `RETURNING uuid`.
3. **Service rewrite** — rewrite `create_reply.py` to mirror `create_activity.py`'s structure: `run(message, cognito_user_id, activity_uuid)`, validation returning `model['errors']`, an insert via `db.query_commit`, then a re-query through `db.template('activities','object')` so the response shape matches the feed (this reuses the Task B parity fix automatically).
4. **Route** — in `app.py`, replace the hardcoded handle in `data_activities_reply` with the JWT pattern already used in `data_activities`: `extract_access_token` → `cognito_jwt_token.verify` → `claims['sub']`, with a `TokenVerifyError` branch returning `{}, 401` placed *before* the generic exception handler.
5. **Counter** — decide whether `activities.replies_count` should be incremented on the parent activity. If yes, do it in the same SQL transaction as the insert.

**Verification:** post a reply as one account, refresh, confirm it persists; sign in as a second account and confirm the reply is attributed to the correct author; check the database directly with a JOIN on `reply_to_activity_uuid`.

---

### 1.2 Modals cannot be dismissed

**Observed:** The reply modal and the crud compose modal have no close control. The only exit is to click through to a profile link, which is a side-effect navigation. A user who opens either by accident is stuck.

**Note:** the Edit Profile modal (`ProfileForm.js`) *does* have an X and can serve as the in-repo pattern to copy.

**Files:** `frontend-react-js/src/components/ReplyForm.js`, `frontend-react-js/src/components/ActivityForm.js`, and their CSS. **Needs discovery** — read `ProfileForm.js` and `ProfileForm.css` first to copy its close-control markup, class names, and `setPopped(false)` handler.

**Work required:**
1. Add a close control to both modals matching ProfileForm's existing markup and styling. No new visual language.
2. Add click-outside-to-dismiss: clicking the popup backdrop (not the inner panel) calls `setPopped(false)`.
3. Add Escape-key dismissal via a `useEffect` keydown listener that cleans up on unmount.
4. Reset form state on dismiss (message text, character count, ttl) so a reopened modal is clean.

---

### 1.3 Dead affordances — decision required before build

**Observed:** Several UI controls render but do nothing: Like, Repost, and Share icons on every crud (`ActivityActionLike.js`, `ActivityActionRepost.js`, `ActivityActionShare.js` — no click handlers, no endpoints); the search box (`Search.js` — an input with no state or handler, and the component is internally misnamed `ActivityFeed`); the "More" nav item (`url="/#"`).

**Decision needed (human):** for a 20–30 person beta, hiding non-functional controls is hours of work while building them is weeks. Recommended: hide Like/Repost/Share and More, keep Reply (being built in 1.1), and treat search as Tier 2.

**If hiding:** conditionally render or remove the three action components from `ActivityItem.js`, and remove the More `DesktopNavigationLink` from `DesktopNavigation.js`. Do not delete the component files — they're the starting point when these features are built for real.

---

### 1.4 Mobile responsiveness check

**Observed:** the layout is a fixed three-column desktop design (`nav` / `.content` / `section` sidebar). Behavior on a phone viewport has not been tested. Most beta testers will open the link on a phone first.

**Work required:** **Needs discovery** — audit `App.css` and the page CSS files for existing media queries before authoring anything. At minimum: verify the app is usable at 390px width, and if it is not, add media queries that collapse the sidebar and reduce nav to icons. Do not redesign; the goal is "usable," not "polished."

---

### 1.5 Operational readiness (human-run, not Kiro)

These only matter once the environment stays up for testers, and they are AWS console/CLI work rather than code:

- **CloudWatch alarms → SNS email:** ALB 5xx rate, unhealthy target count, RDS CPU and free storage.
- **AWS Budget alert** as a financial tripwire (~$100–120/month expected for always-on).
- **Automated RDS backups** (currently only manual snapshots exist).
- **Decide an uptime window.** "Up weekdays, down weekends" is legitimate for a beta and halves the bill.

---

## Tier 2 — Nice to have before beta, acceptable after

### 2.1 Message list does not update after sending

**Observed:** after sending a DM, the message-group list and thread do not reflect the new message until the page is refreshed.

**Files:** `frontend-react-js/src/components/MessageForm.js`, `frontend-react-js/src/pages/MessageGroupPage.js`, `frontend-react-js/src/pages/MessageGroupNewPage.js`. **Needs discovery** — read `MessageForm.js` to determine whether the send response is being pushed into parent state at all, and whether the message-groups list is fetched only on mount.

**Work required:** mirror the optimistic-update pattern already used in `ActivityForm.js` (`props.setActivities(current => [data, ...current])`). Push the send response into the messages state, and ensure a newly created message group appears in the list without a reload.

---

### 2.2 `ProfileAvatar` receives an undefined id in the Edit Profile modal

**Observed:** with the Edit Profile modal open, the browser requests `https://assets.fentoncruddur.com/avatars/processed/undefined.jpg` and gets a 403 (S3 masking a 404). One broken image inside the modal; no functional impact on upload.

**Cause hypothesis:** a component in the profile-form context renders `<ProfileAvatar id={...} />` with a value that isn't `cognito_user_id` — likely a response-shape gap, the same family as the Task B fix. **Needs discovery** — read `ProfileForm.js` and check what `update_profile.py` returns versus what `db/sql/users/show.sql` returns.

**Work required:** pass the correct `cognito_user_id` through, and add a guard in `ProfileAvatar.js` so it renders nothing (or a neutral placeholder) when `id` is falsy, rather than requesting `undefined.jpg`.

---

### 2.3 Search is a non-functional stub

**Files:** `frontend-react-js/src/components/Search.js` (input with no state, component internally misnamed `ActivityFeed`); backend `GET /api/activities/search` and `services/search_activities.py` already exist. **Needs discovery** — read the backend service to confirm what it actually queries before wiring the frontend to it.

**Work required:** rename the component function to `Search`, add controlled input state and a submit handler that calls the existing search endpoint, and render results. Consider whether search should also cover users (a handle/display-name `ILIKE` filter on the existing `/api/users` endpoint) — for beta scale, user search is arguably more useful than crud search.

---

### 2.4 Notifications page may be mock data

**Observed:** not verified. `backend-flask/services/notifications_activities.py` was a hardcoded list in the bootcamp build.

**Work required:** **Needs discovery** — read the service. If it returns a hardcoded list, either hide the Notifications nav item for beta (a nav item leading to fiction is worse than no nav item) or implement real notifications, which is a substantial feature and belongs in Tier 3.

---

### 2.5 Sidebar Trending and Suggested Users are hardcoded fixtures

**Observed:** `DesktopSidebar.js` contains a literal `trendings` array (`#100DaysOfCloud` etc.) and a `users` array containing only a fabricated "Andrew Brown," who appears to every real user.

**Work required (Suggested Users, cheap):** replace the hardcoded array with a fetch of the existing `GET /api/users` endpoint, excluding the signed-in user, limited to a handful of entries. `SuggestedUserItem` already links to profiles after Task E. Also wire `ProfileAvatar` into `SuggestedUserItem` (its avatar is currently an empty placeholder div).

**Work required (Trending, larger):** requires hashtag parsing and aggregation that doesn't exist. Either hide the Trending section for beta or leave it as visibly decorative. Human decision.

---

### 2.6 DM components have no avatars

**Observed:** `MessageGroupItem.js` and `MessageGroupNewItem.js` render `<div className='message_group_avatar'></div>` — an empty placeholder. Conversations show a blank purple circle instead of the person's face.

**Work required:** pass `cognito_user_id` through the message-group data (verify it is present in the DynamoDB item shape and the `create_message_users.sql` result — **needs discovery**) and render `<ProfileAvatar id={...} />` in place of the empty div, sizing it via the existing `.message_group_avatar` dimensions rather than adding new CSS.

---

### 2.7 No empty states or loading indicators

**Observed:** a new user's feed is a blank void with no explanatory text; pages pop in without any loading affordance.

**Work required:** add a simple empty-state message to the home feed, People page, and Messages list when their arrays are empty, and a minimal loading indicator during fetch. Reuse existing typography classes; no new visual language.

---

### 2.8 Errors are not surfaced to users

**Observed:** failures are handled with `console.log` throughout the frontend. When a post or message fails, the user sees nothing happen.

**Related backend issue:** `create_message.py` (and possibly sibling services) catch exceptions, print them, and return `None`, which causes Flask to raise `TypeError: the view function did not return a valid response` and emit an opaque 500. This was visible in the DynamoDB `AccessDeniedException` incident — the real error was buried under a misleading TypeError.

**Work required:** in the backend, ensure service methods return a structured error rather than `None` on exception, and have routes translate that into a JSON error response with an appropriate status. In the frontend, display a brief inline error message on failed submits rather than only logging.

---

## Tier 3 — Post-beta / production polish

### 3.1 Per-user profile banners

`ProfileHeading.js` hardcodes `assets.fentoncruddur.com/banners/banner.jpg` for every profile. Making banners per-user requires a `users` table column, an upload path, Lambda processing, and a template change. Real feature, not beta-blocking.

### 3.2 Codify API Gateway and S3 CORS into the CDK stack

The CORS configurations fixed during Week 14 were applied via CLI and live only in the deployed resources. The API Gateway is CDK-managed (`thumbnail-serverless-cdk`), so its `CorsConfiguration` and the uploads bucket's CORS rules should be declared in the stack. **This is the same class of gap as the Route 53 records were** — manual configuration that a rebuild would silently lose. Values to codify: allowed origins `http://localhost:3000` and `https://fentoncruddur.com`; methods `PUT`, `POST`, `GET`, `OPTIONS`; headers `*`.

### 3.3 Debug logging cleanup

`app.py` and `create_activity.py` contain verbose emoji-prefixed `print()` statements that log request headers and payloads to CloudWatch on every request. Convert to proper `app.logger` levels, and stop logging full header dictionaries in production.

### 3.4 `schema.sql` and migrations have drifted

A fresh local setup from `schema.sql` lacks the `bio` column added by migration, so local and production schemas differ. Reconcile `schema.sql` with all applied migrations so a clean local setup matches production.

### 3.5 Environment parameters into SSM Parameter Store

`aws/cfn/*/config.toml` files are gitignored, so deployed image digests and stack parameters aren't recoverable from git. Migrating these to SSM Parameter Store would make the deployed configuration auditable and reproducible.

### 3.6 `'handle'` key holds a cognito_user_id

In `create_activity.py`'s validation-error branch, `model['data']` still uses the key `'handle'` while storing a `cognito_user_id`. Cosmetic naming debt with no functional impact (the frontend does not read individual keys from error responses). Clean up when that file is next touched.

### 3.7 Follow/friend system, presence, recommendations

Explicitly out of scope for beta. A flat directory is the better experience at 20–30 users, where everyone can find everyone.

---

## Tier 4 — Required only for open public launch

Not needed for a closed beta of invited people; all are table stakes if the app is ever opened to strangers:

- Moderation tooling: report, block, admin content removal, user ban
- Terms of Service and Privacy Policy (the footer links are currently `href="#"`)
- WAF rules on the ALB, rate limiting, bot protection on signup
- Opt-out visibility for the People directory and gated DMs
- A considered answer to whether Cruddur is a product or a portfolio artifact