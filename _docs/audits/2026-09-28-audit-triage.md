# Cruddur — Kiro Repo Audit: Triage and Fix Backlog

Reviewed 2026-09-28. Source: Kiro's read-only full-repo audit (1 critical, 8 high, 22 medium,
18 low). This doc records Claude's independent triage of that audit, what must be fixed
before new features, and the revised order of work. It supersedes the "Next session plan"
table in `claude/Cruddur_Handoff_Next_Session.md`.

> **Action for C:** save Kiro's raw audit JSON to `_docs/audits/2026-09-28-kiro-repo-audit.json`
> in the repo and upload a copy to this project. The triage below covers every finding that
> Kiro backed with file:line evidence. A few medium/low items were only summarised in chat,
> and the raw JSON is the record of those.

---

## 1. Verdict: fixes first, but not all of them

**Do the security and data-integrity fixes before likes and the sidebar. Leave the
observability and IaC findings until after the features.**

The reasoning is simple. The likes spec adds new `query_commit` calls, new authenticated
routes in `app.py`, and a new migration. Three of the audit's top findings sit in exactly
those places. The first is `lib/db.py` error handling. The second is `app.py` logging bearer
tokens. The third is the migration generator's prefix width. If we build likes on top of
them and fix them afterward, we touch the same lines twice and have to re-verify likes.
Fixing them first costs about the same effort, and the features then land on a foundation
that has already been proven.

The observability findings (OTEL inert, X-Ray unwired, watchtower without IAM) and the IaC
gaps are real, but nothing we're building depends on them. They are portfolio work in their
own right and make a good "epic" after the features.

**Nothing in the audit blocks the pending PR.** `b84a463` and `cebcc3e` were verified live in
pilot #2 and should go to `main` first, as planned.

---

## 2. Critical and high findings: triage

Each finding is marked as agreed, adjusted, or needs-verification, and gets a priority:
P0 = before any feature work, P1 = with the fix batch, P2 = after features, P3 = epic/later.

| ID | Finding | Evidence | Claude's call | Priority |
|---|---|---|---|---|
| CRIT-01 | `teardown-all` deletes RDS with `--skip-final-snapshot` and no gate | `bin/cfn/teardown-all:47-58` | **Agree.** Our `&&` chain (snapshot → then teardown) has protected us so far, but the script itself will destroy every write since the last snapshot if it is run alone. On Sept 26 a double-paste nearly did exactly that, and the chain is what stopped it. The fix belongs in the script, not in operator discipline. | **P0** |
| HIGH-02 | Bearer tokens written to logs | `app.py:437` prints all request headers; `app.py:199` prints 50 chars of `Authorization`; `function.rb:6,:24`; lambda-authorizer `index.js:13` | **Agree.** Anyone who can read CloudWatch Logs can replay a token until it expires (Cognito default: 1 hour). Tokens already logged have expired, so the historical risk is small. The fix stops future exposure. | **P0** |
| HIGH-01 | DM IDOR: no membership check when reading or posting to a message group | `services/messages.py`, `services/create_message.py` | **Agree.** Any signed-in user who learns a `message_group_uuid` can read and post into someone else's conversation. This is the classic OWASP "broken access control" bug and the one an interviewer would probe. | **P0** |
| HIGH-05 | `query_commit` returns None on both success and failure; zero-row crashes | `lib/db.py` | **Agree; already covered** by `kiro-spec-hardening.json`. | **P0** (existing spec) |
| HIGH-07 | `bin/frontend/build` omits `--build-arg REACT_APP_API_GATEWAY_ENDPOINT_URL` | `bin/frontend/build:26-34` | **Agree, and more urgent for us than Kiro rated it:** this is *our* build path. The deployed frontend image `f76d255f…` was built with it, so **avatar upload is probably broken in production right now.** Verify in pilot #3 before and after the fix. | **P0** |
| — | `create_activity.py` has no None check | `services/create_activity.py` | **Agree.** This is the same bug class as HIGH-05. Once `query_commit` returns None honestly, every caller must check the result. | **P1** |
| — | Migration generator prefix is variable-width | `bin/generate/migration`: `str(time.time()).replace('.','')`; ~24% of outputs are under 17 digits | **Agree; this is a latent data bug.** `bin/db/migrate` now compares filename prefixes (`2fe0914`). A 16-digit prefix compares *smaller* than `17800000000000001` and would be silently skipped. Our specs hand-pick prefixes, so this has not bitten yet. | **P1** |
| — | `schema.sql` lacks `bio`; `bin/db/setup` doesn't run migrate | `db/schema.sql`, `bin/db/setup` | **Agree.** A fresh local database would not match production. This matters for reproducibility, not for the live app. | **P1** |
| — | Bare `@cross_origin()` probably overrides the app-level allowed origins | `app.py` (decorated routes) | **Needs verification.** If true, those routes send `Access-Control-Allow-Origin: *`. Because auth uses a header rather than cookies, the practical risk is low, but it contradicts our CORS config. Verify in pilot #3 with an `Origin: https://evil.example` curl. | **P1** (verify, then fix) |
| — | Frontend ECS tasks share `ServiceSG`, which RDS trusts | CFN service/frontend templates | **Agree, defense in depth.** A compromised nginx container could reach Postgres. The fix needs a new security group plus a redeploy, so it is best done as its own small infra change. | **P2** |
| — | `buildspec.yml:14` builds the dev Dockerfile | `backend-flask/buildspec.yml` | **Downgrade.** CodeBuild is not in use (backlog #23). Fix it when we adopt CodeBuild. | **P3** |

## 3. Medium and low findings: triage

| Finding | Call | Priority |
|---|---|---|
| `DateTimeFormats.js` uses `'LLL L'`, which shows the month number where the day belongs | Agree. A visible bug and a one-line fix. | P2 quick win |
| `MessageItem` links to `/messages/@handle` (wrong route) | Agree. | P2 quick win (fold into the conversation-avatars spec, which already edits `MessageItem`) |
| `UserFeedPage` doesn't pass `setPopped` / `setReplyActivity` | Agree. Replying from a profile page is broken. | P2 quick win |
| `ActivityForm` has no close control | Agree. UX. | P2 quick win |
| `ddb.py` queries the sort key with the current-year prefix, so conversations "disappear" on Jan 1 | Agree. **Hard deadline: fix before Dec 31, 2026.** | P2, dated |
| No `expires_at` filter anywhere, so the TTL chosen at post time is ignored | Agree, but this is an unfinished feature rather than a bug. It needs a small design decision: hide expired posts, or show them greyed out. | P2 feature |
| OTEL effectively inert (FlaskInstrumentor disabled; RequestsInstrumentor applied after the JWKS fetch) | Agree. | P3 Observability epic |
| X-Ray: no `patch_all`, sampling rule not applied, `AWS_XRAY_URL` unset | Agree. | P3 Observability epic |
| watchtower has no IAM permissions | Needs verification. It may be silently failing, or generating errors in the logs. | P3 Observability epic |
| IaC gaps: DynamoDB table and stream, avatar Lambdas, API Gateway, CI/CD not in CloudFormation | Agree. This also means the HIGH-02 Lambda fixes must be deployed by hand (see §5). | P3 IaC epic |
| CRLF line endings in `ActivityForm.js` and some SVG/`toml.example` files | Agree. Add `.gitattributes` and normalise in one isolated commit. | P3 hygiene |
| Stale docs | Agree. | P3 hygiene |
| Home route uses `claims['username']` (LOW-04) | Already fixed by `kiro-spec-likes.json` (switches to `sub`). | covered |
| Every request logged at ERROR level (LOW-05) | Already fixed by `kiro-spec-hardening.json`. | covered |
| Avatar cache key (part of MED-19) | Already fixed by `kiro-spec-hardening.json`. | covered |

**Kiro corrected itself on two points, and we accept both corrections.** The stack-name
mismatch is not real, because local config uses `CrdService`. The `import process` finding
belongs at medium. It is a good sign that the audit checked its own sub-agents.

---

## 4. Revised order of work

The principle is that each pilot proves one kind of change. Pilot #3 proves *fixes didn't
break anything*. Pilot #4 proves *features work*. If something fails, we know which batch
caused it. An extra pilot costs about $0.40.

| Step | What | Spec | Covers | Pilot |
|---|---|---|---|---|
| 0 | PR `kiro-dev → main` for `b84a463` + `cebcc3e`, then `git merge --ff-only origin/main` | — | — | already proven |
| 1 | **Security fixes** | `kiro-spec-security.json` *(to write)* | HIGH-02 token logging (app.py, function.rb, index.js); HIGH-01 DM membership check; report on bare `@cross_origin()` usage | #3 |
| 2 | **Data-integrity hardening** | `kiro-spec-hardening.json` *(written, unchanged)* | HIGH-05, #12, #13, #15, #16, #21, schema uuid | #3 |
| 3 | **Hardening add-on** | `kiro-spec-hardening-2.json` *(to write)* | `create_activity.py` None check; fixed-width migration prefix; `schema.sql` bio; `bin/db/setup` runs migrate | #3 |
| 4 | **Ops safety** | `kiro-spec-ops-safety.json` *(to write)* | CRIT-01 teardown snapshot gate; HIGH-07 frontend build-arg | #3 |
| 5 | **Conversation avatars + MessageItem link** | `kiro-spec-conversation-avatars.json` *(written; add the link fix)* | #17 + MessageItem route | #3 |
| 6 | **Pilot #3** | — | deploy, verify all of the above, verify avatar upload, CORS origin probe, snapshot, teardown, PR | — |
| 7 | Likes | `kiro-spec-likes.json` *(written; re-check phase-1 anchors after steps 1–3 change app.py and lib/db.py)* | #18 | #4 |
| 8 | Sidebar | `kiro-spec-sidebar.json` *(written; same re-check)* | #19 #20 | #4 |
| 9 | Quick wins | `kiro-spec-quick-wins.json` *(to write)* | date format, UserFeedPage props, ActivityForm close | #4 |
| 10 | **Pilot #4** | — | migrate (likes!), verify, snapshot, teardown, PR | — |
| 11 | Before Dec 31 | `kiro-spec-ddb-year.json` | `ddb.py` year-prefix bug | #5 or later |
| later | Epics | — | SG split; `expires_at`; Observability (OTEL/X-Ray/watchtower); IaC (DDB, Lambdas, API GW, CodeBuild); CRLF; docs | — |

**Important knock-on effect:** the likes and sidebar specs were written against the Sept 26
versions of `app.py` and `lib/db.py`. Steps 1–3 change both files. Before running likes or
the sidebar spec, Claude must re-read the new versions and update those specs' phase-1
anchor checks. Otherwise Kiro will correctly STOP on a mismatch, and credits will be wasted.

### Files Claude needs to write the new specs (C pastes these; no credits)

```bash
cd ~/aws-bootcamp-cruddur-2023
GIT_PAGER=cat git log --oneline -1
sed -n '185,260p;425,445p' backend-flask/app.py   # token prints (199, 437) + after_request (245) context
grep -n "cross_origin" backend-flask/app.py
cat backend-flask/services/messages.py
cat backend-flask/services/create_message.py
cat backend-flask/lib/ddb.py
cat backend-flask/services/create_activity.py
cat bin/cfn/teardown-all
cat bin/frontend/build
cat bin/db/setup
cat bin/generate/migration
cat bin/db/migrate
```

The Lambda sources should be located first, because their paths vary. The next command
prints file names only:

```bash
cd ~/aws-bootcamp-cruddur-2023
git ls-files | grep -E 'function\.rb$|lambda-authorizer/index\.js$'
```

Then `cat` each path it prints.

---

## 5. Things to check that aren't code

**Old tokens in CloudWatch Logs.** The command below is read-only:

```bash
aws logs describe-log-groups --log-group-name-prefix /cruddur \
  --query 'logGroups[].[logGroupName,retentionInDays,storedBytes]' --output text
```

If `/cruddur/CrdService` still exists after teardown with retention `None` (never
expires), those logs hold expired tokens forever. Setting a retention period such as 14 days
is a mutating command, so decide in session first. The tokens are expired, which makes this
tidy-up rather than an emergency. Also check whether the Lambda log groups
(`/aws/lambda/...`) have retention set.

**Lambda redeploy.** `function.rb` (avatar upload) and the lambda-authorizer are not managed
by CloudFormation (IaC gap). Changing their code in git does nothing until each is zipped and
uploaded with `aws lambda update-function-code`, which C runs by hand. The security spec's
`verify_next_deploy` will include those steps.

**Avatar upload today.** In pilot #3, test the upload on the *old* frontend image first,
then the fixed one. That proves HIGH-07 was real, which makes a good interview story.

---

## 6. Cost of the fix batch

AWS: the fixes add no new services. Pilot #3 costs about $0.30–0.40, and splitting features
into pilot #4 adds another ~$0.40. Kiro credits: security ~25–35, hardening ~30–40 (already
estimated), hardening-2 ~15–20, ops-safety ~15–20, quick wins ~15. Adding these to the
~120–150 already estimated for the feature specs gives **~200–260 credits total, well inside
the 1,000 monthly.**

---

## 7. Interview framing

"I ran a full-repo audit with an AI agent, then triaged it myself. I accepted the security
and data-integrity findings and fixed those before shipping new features, because the new
features would have built on the broken code paths. I downgraded findings in code that
wasn't in use, and deferred observability to its own epic. One 'high' was more severe than
rated, because it was in my own build script and had broken avatar upload in production
without anyone noticing. I proved that with a before/after test."