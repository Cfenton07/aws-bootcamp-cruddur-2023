# Week 14 — Beta Discovery Features: Authoring, Local Proof, and Production Deploy

**Sessions:** July 21 (Kiro authoring + gates), August 1 (local smoke test), August 4–5 (deploy + production verification)
**Branch:** `kiro-dev` → merged to `main` via PR #13 (`44d254b`)
**Outcome:** Six features and three defects shipped and verified in production on `fentoncruddur.com` with two real Cognito accounts.

---

## 1. What I set out to do

Coming out of Week 13, the app was infrastructure-complete but had never actually been used by more than one person. I wanted to know whether I could open it to a small group of invited testers, so I audited the app from a user's point of view instead of an operator's. That audit produced two conclusions that reframed the work:

1. **The app was not multi-user correct.** Post attribution was hardcoded to my own handle, so any second user's crud would have appeared under my name.
2. **There was no way to find anyone.** Starting a DM required already knowing someone's handle. The social loop had a hole in the middle of it.

So the goal for this stretch became: make the app multi-user-correct and self-discoverable, prove it locally, then prove it in production.

---

## 2. What I built (Tasks A–F)

I had Claude read the full codebase before writing the spec, which changed the task list substantially from my first draft. Reading the actual code turned "audit every component and wire up links" into "one component is unlinked, and by the way here are two P0 bugs you didn't know about."

**Task A — real post attribution (P0).** `app.py` had `user_handle = 'chrisfenton'` hardcoded in `data_activities`, with a `# TODO: get from authenticated user` comment next to it. The frontend wasn't even sending an Authorization header, so identity had no path to the backend. The fix threaded JWT identity end to end: `ActivityForm.js` now sends `Bearer ${accessToken}`, `data_activities` verifies the token and pulls `claims['sub']`, `create_activity.py` takes `cognito_user_id` instead of a handle, and `create.sql` resolves the user by `cognito_user_id` instead of by handle. I also added a `TokenVerifyError` branch returning 401 — placed *before* the generic exception handler, so an unauthenticated post is rejected rather than swallowed into a 500.

**Task B — response shape parity.** New posts rendered with a broken avatar until you refreshed the page. The cause was a shape mismatch: `home.sql` returns `cognito_user_id` (which `ProfileAvatar` uses to build the image URL) but `object.sql` — which builds the create-activity response — didn't. Since `ActivityForm` prepends the create response straight into the feed, the fresh post had no avatar field. Diffing the two SQL files showed `object.sql` was also missing `replies_count`, `reposts_count`, `likes_count`, and `reply_to_activity_uuid`, so the fix was five added fields, not one.

**Task C — per-user profile nav.** `DesktopNavigation.js` hardcoded `url="/@chrisfenton"`. Every user's Profile button led to my page.

**Task D — Edit vs. Message on profiles.** `ProfileHeading` rendered Edit Profile unconditionally, including on other people's profiles. Now it computes `isOwnProfile` and renders either Edit Profile or a Message link into `/messages/new/:handle`, reusing the existing `.profile_edit_btn` class so the layout is unchanged.

**Task E — clickable suggested users.** The feed already linked usernames; the sidebar's `SuggestedUserItem` was the one component that didn't.

**Task F — People directory.** New `GET /api/users` endpoint, new `index.sql`, new `users_index.py` service, new `/people` page and route, and a People nav item. Zero new AWS resources — it rides entirely on infrastructure I was already paying for.

---

## 3. How the agent workflow went, and what broke in it

I ran this the same way as Bucket C: Claude wrote the spec, Kiro authored the files, and I ran every verification gate myself. Three things happened worth recording.

**A checkpoint restore wiped Kiro's context mid-task.** I pasted rulings resolving two spec contradictions, and Kiro came back saying it had no record of the spec, searched the repo to confirm it wasn't there, inventoried exactly what it could and couldn't do from the rulings alone, and refused to proceed. That was the correct behavior under conditions where agents usually improvise — but the root cause was mine: **the spec only existed in chat context, which is ephemeral.** I fixed it by putting the spec in the repo at `.kiro/specs/` (later archived to `_docs/specs/` since `.kiro/` is gitignored). Durable instructions belong in files. It's the same principle as moving DNS records into CloudFormation instead of clicking them into the console.

**Kiro found a real error in my spec.** I had told it to wrap `index.sql` in the manual `COALESCE(array_to_json(array_agg(row_to_json(...))))` pattern *and* to match the helper `home_activities.py` uses. Kiro read `lib/db.py`, found that `query_array_json` already applies that wrapping internally, and stopped to report that following the instruction literally would double-wrap and break the query. It was right and I was wrong — I'd stated an inference as a fact. Plain `SELECT` was correct.

**Two edits Kiro reported as complete were never on disk.** `App.js` and `DesktopNavigationLink.js` both appeared in the completion report with specific descriptions, and neither file showed as modified in `git status`. This is the second time this exact failure has happened. The rule I'm writing down: **an agent's completion report describes intent; the disk is the only source of truth.** My grep gates caught it both times, which is the whole reason the gates exist.

All six gates passed after the re-application: no hardcoded identity outside the explicitly out-of-scope reply route, auth wired end to end, exactly five fields in `object.sql`, the profile conditional present, the directory fully wired, and a clean frontend build.

---

## 4. Local smoke test — where the interesting bugs were

I ran the whole feature set locally before deploying, and the local environment surfaced problems I would otherwise have found in production in front of testers.

**Stale code was running and I didn't know it.** My first local test showed the avatar bug I had just fixed. That symptom — a bug I'd fixed reappearing — was the tell. The cause was in `docker-compose.yml`: the backend volume mounted `./backend-flask` to `/backendflasktype`, a typo'd path nothing reads. The container was serving whatever code was baked into the image, which predated the fix. The frontend mount was correct, which is why symptoms were mixed: new frontend sending an auth header to an old backend that ignored it. **Running containers are not your source files**, and a one-character typo in a mount path can silently invalidate an entire test session.

**The environment file had lost most of its variables.** Sign-in failed with "Auth UserPool not configured" because `frontend-react-js.env` contained exactly one line. Because it's gitignored, nothing had preserved the Cognito variables. I restored them from the template and from the AWS CLI, then had to restore the API Gateway endpoint variable separately when avatar upload failed for the same reason.

**Both CORS layers in the avatar pipeline were misconfigured for production.** The upload goes browser → API Gateway → Lambda → presigned PUT → S3, and the browser hits CORS at two separate hops. The API Gateway had `CorsConfiguration: null` — no CORS at all, for any origin, including my production domain. The S3 uploads bucket had a rule allowing `https://*.app.github.dev` — a leftover from my Codespaces days that no longer exists. I fixed both to allow `http://localhost:3000` and `https://fentoncruddur.com`. **These would have broken every beta tester's first avatar upload**, and local testing is the only reason I found them before invites went out.

**The two-account attribution test.** I mapped both of my real Cognito accounts onto seeded database rows by stamping their real `sub` values into `cognito_user_id` (the seeds ship with `MOCK`). Then I signed in as the second account and posted. It appeared as Antwuan Jacobs, not Chris Fenton. A `SELECT` joining activities to users showed two distinct handles owning distinct rows. That was the moment Task A stopped being a claim and became a fact.

---

## 5. Deploy and production verification

Pre-flight closed the last standing security item: I rotated the `C.Fenton_CLI` access key using the two-key overlap pattern — create the second key, point the CLI at it, verify with `sts get-caller-identity`, *then* deactivate the old one. Never a moment without a working credential. I also re-enabled the CodePipeline Build inbound transition, which had been disabled since the git history scrub — and found my own note in the disabled-reason field explaining why and when to re-enable it. Leaving the reason and the re-enable condition in the field that supports it turned out to be worth doing.

**A missing build argument would have broken avatar upload for everyone.** Reading `frontend-react-js/Dockerfile.prod` before building, I noticed it declared five `REACT_APP_*` build args and not `REACT_APP_API_GATEWAY_ENDPOINT_URL` — the one the upload flow needs. Because React bakes these at build time, the production bundle would have had `undefined` for the gateway URL. Local testing found the CORS gaps; *reading the build definition* found the missing variable. Two different failure modes on the same feature, both caught before users.

All five stacks deployed cleanly on the first pass — no failures, which is the first time that has happened. The Route 53 alias records self-healed for the third consecutive deploy, so the domain rewired itself with zero console interaction. The backend health check returned `{"success": true, "version": 1}` over HTTPS, both target groups went healthy, and posting worked immediately in production.

**DMs 500'd in production, and the cause was a TODO I had written myself.** Both `/api/message_groups` and `/api/messages` returned 500 from gunicorn. The CloudWatch logs gave the exact answer: `AccessDeniedException` — `CrdService-TaskRole` was not authorized for `dynamodb:Query` or `dynamodb:BatchWriteItem`. When I opened the template, there it was at the bottom of the TaskRole policies:

```
# TODO (CrdDynamo session): add scoped DynamoDB permissions for the
# cruddur-messages table here. Not added now.
```

I had deferred it deliberately, written down why, and production verification found exactly the gap the note predicted. The fix was a scoped policy granting the seven needed actions on the `cruddur-messages` table **and** on `table/cruddur-messages/index/*` — the index ARN has to be granted separately, because a table-level grant does not cover a Query against a GSI.

The change set for that fix taught me something I'd predicted wrong earlier. I had guessed that changing an IAM policy would show TaskRole as Modify and leave the Service alone. What it actually showed was a three-resource cascade: TaskRole Modify (Replacement: False — editing inline policies doesn't recreate a role), TaskDefinition Modify with `Replacement: Conditional` caused by `TaskRoleArn` with `RequiresRecreation: Always` (task definitions are immutable, so a new revision gets registered), and Service Modify caused by the task definition reference. My earlier prediction had also been graded against a from-scratch deploy where everything showed as Add — which taught me that **change-set actions describe the delta between deployed state and desired state, not between my old code and my new code.**

After the IAM fix, DMs worked in both directions between the two accounts, and avatar upload succeeded end to end from the production domain — `key_upload` 200, presigned PUT 200, processed JPEG served from CloudFront. Every fix from this stretch is verified in production.

---

## 6. Prediction drills

I've been practicing writing predictions with confidence levels before observing results. Two were graded this stretch.

On who owns historical activity rows, I was right that they all belong to my account, but I answered a question about *visibility* when the drill was about *attribution*. The sharper answer: the fix is prospective. It changes how future inserts resolve identity; it does not rewrite the `user_uuid` already stamped on existing rows. Historical misattribution is frozen in the data. That distinction — display logic versus stored state — is exactly what an interviewer means by "what does your fix do to existing data?"

On the change set, I was right about the direction (Modify, not Replace) but wrong that the Service wouldn't appear, and my reasoning was missing the fact that the resource graph propagates. Seeing the actual `Details` array with `CausingEntity` fields made the dependency chain concrete in a way reading documentation hadn't.

---

## 7. What I'm taking away

- **Durable instructions belong in files, not chat.** Anything that has to survive a session reset needs to be on disk and in git.
- **An agent's report is a claim; the disk is the evidence.** Twice now, gates caught edits reported as complete that never landed.
- **A bug you already fixed reappearing means you're not running the code you think you are.** That symptom now sends me to look at mounts, images, and deployed revisions before I look at logic.
- **Browser upload pipelines have CORS at every hop the browser touches.** My earlier CORS story was ALB path routing; this one was a null API Gateway config *plus* a stale S3 bucket policy behind it.
- **Deferred work should be deferred in writing, in the file where it will be needed.** Both the TaskRole TODO and the pipeline disable-reason paid for themselves.
- **Solo testing cannot find multi-user bugs.** The hardcoded handle survived months of development because it happened to be correct for the only person using the app. It took a second real account to falsify it.

---

## 8. Status at close

| Item | State |
|---|---|
| Tasks A–F | Shipped, verified in production |
| DynamoDB TaskRole permissions | Fixed in IaC, DMs working both directions |
| API Gateway + S3 CORS | Fixed for localhost and production origins |
| Frontend Dockerfile build arg | Added; avatar upload verified end to end |
| docker-compose mount path | Fixed |
| `C.Fenton_CLI` key rotation | Complete; old key deleted |
| CodePipeline Build transition | Re-enabled |
| PR #13 | Merged to `main` (`44d254b`) |
| Infrastructure | Torn down; idle cost at zero |

Open items are captured in `_docs/backlog.md`, tiered by whether they block a closed beta.