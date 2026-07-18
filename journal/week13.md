# Week 13 — Hardening: Self-Healing DNS, Verified Teardown, Credential Remediation

Session: July 13, 2026 · *Week in progress — history scrub and PR to main will be appended.*

Week 12 built the architecture. This week made it trustworthy: the two classes of manually-pinned values that broke on every rebuild got moved into infrastructure, the teardown script learned to verify instead of assume, and a credential incident got remediated end to end — including one trap I caught before it ever fired.

## Fixing the SSM hostname — before anything was deployed

The crud-write bug from week 12 was a stale hostname in `/cruddur/backend-flask/CONNECTION_URL`. The interesting property: because the CrdDb template hardcodes the instance identifier, the RDS endpoint hostname is deterministic — so I could fix the parameter **before any stack existed**. I pulled the value into a shell variable, swapped the host with bash substring substitution, sanity-checked only the portion after the `@` (never displaying the credential), and wrote it back. Version 3.

## A lesson in what a "failed" command still does

While pulling the parameter, a bracketed-paste artifact corrupted an assignment — and bash still executed the command substitution inside it, printing the fully decrypted connection URL, password included, into my terminal error output. Lesson learned the sharp way: **command substitution runs even when the surrounding syntax is broken.** A failed command is not inert. I treated the credential as exposed and scheduled a rotation for the same session (below), and I now type sensitive commands instead of pasting them.

## Gap 2 closed: Route 53 in IaC

I added two `AWS::Route53::RecordSet` resources to the CrdCluster template — alias A-records for the apex and api subdomain, targeting the ALB. Two details worth remembering:

- **There are two different zone IDs in play.** The `AliasTarget` uses the ALB's own `CanonicalHostedZoneID` (via `!GetAtt`), while the RecordSet's `HostedZoneId` property is *my* hosted zone — the zone the record is written into. Confusing them is a classic failure.

- **CloudFormation RecordSets use CREATE semantics, not UPSERT.** My manually-created records from prior sessions would have collided with the stack's creation attempt, so I deleted the two stale A-records in the console once — a one-time cleanup. From then on, the stack owns them: teardown deletes them, every deploy recreates them against the fresh ALB.

The proof came after deploy: both records existed, aliased to the brand-new ALB, **and I never touched the Route 53 console.** Two sessions ago this exact moment cost a manual repoint and a DNS-cache goose chase. Tonight: zero clicks.

## Hardening teardown-all: verify state transitions, don't assume success

The previous teardown run had a silent failure: the RDS `delete-db-instance` call failed, an `|| echo` swallowed the error, and the subsequent waiter returned instantly against a still `available` instance — the script reported success for a delete that never happened. The rewrite:

- Capture the delete command's output and exit code.

- On failure, distinguish `DBInstanceNotFound` (fine — already gone) from anything else (print the real error and exit non-zero).

- On success, **poll `DBInstanceStatus` until it actually reads `deleting`** before starting the long wait — so a no-op can never masquerade as success.

On its first live run tonight, the new code confirmed the state transition on the first poll (`attempt 1/12: status=deleting`) — the exact spot where the old script had lied. The principle: **a script should verify state transitions, not assume that a command that didn't visibly error must have worked.** The same audit found four other `|| echo` swallows in the script; all four proved benign, because nothing downstream assumes the swallowed command succeeded — which is precisely the property that makes an error-swallow safe or dangerous.

## Credential remediation, end to end

- Redacted two dead passwords from `journal/week4.md` in the working tree (they had been rotated out previously, but plaintext credentials don't belong in a public repo even dead).

- Rotated the RDS master password during the deploy — at the pause after CrdDb restored, before CrdService launched — then rewrote the SSM parameter (Version 4) so the first backend task read the fresh value at startup.

- **The trap I caught before it fired:** rotating the password on the running instance does nothing to the restore snapshot. The next deploy would have restored an instance carrying the *old* password while SSM held the *new* one — trading last week's PoolTimeout for an auth failure. Fix: took a fresh snapshot of the instance *after* rotation (`cruddur-crddb-post-rotation-20260713`) and repointed the CrdDb template and config at it. Snapshot, instance password, and SSM are now consistent by construction.

- Still open: scrubbing the old credential blobs from git history (`git filter-repo`) before the PR to main. Scrubbing is hygiene, not incident response — rotation is what actually closed the exposure.

## The decisive test

With everything deployed: posted a crud with DevTools open. `POST /api/activities` returned **200 in ~42 milliseconds** — against last week's 30-second timeout and 500. Hostname fix, rotated password, security group chain, and schema all validated by one request. (One cosmetic bug logged: new posts show a broken avatar until refresh — the optimistic UI update object lacks the avatar UUID field the home query returns. App-layer, P3.)

## Closing out the week: history scrub, prod repoint, PR #11

The remaining Bucket A items landed across two follow-up sessions. I scrubbed both leaked passwords from all 343 commits of git history with `git filter-repo --replace-text` (backup clone first — the only undo button a history rewrite has), verified with `git log -S` across all refs, and force-pushed the rewritten history to both `kiro-dev` and `main`.

The scrub surfaced a lesson bigger than the scrub itself: before deleting any git ref, ask not just "does it hold unique commits" but "does anything point at it by name." My `prod` branch is the CodePipeline trigger — deleting it would have broken my GitOps deployment wiring. The fix was a repoint, not a deletion: I disabled the pipeline's Build stage transition (infrastructure was torn down, so a triggered deploy would only fail noisily), moved `prod` to the equivalent commit in the rewritten history, and force-pushed. Branch preserved, pipeline wiring intact, tainted lineage gone. Stale branches and the old `week-2` tag — refs nothing pointed at — were deleted outright.

PR #11 merged `kiro-dev` into `main` with a merge commit (not squash — the individual commit stories are the portfolio). Final safety detail: the pre-scrub backup clone had been created inside the working repo, where a careless `git add -A` could have re-committed the tainted history. Moved it outside the repo. The sanity check I almost didn't run was the one that found something.

## Bucket C: killing the stored-credential class entirely

With the architecture proven, the next session removed the root cause behind both of this build's root-caused outages: stored values that must track infrastructure but only do so by human ritual.

**Gunicorn replaced the Flask dev server.** The production image now runs `gunicorn -w 2 --threads 4` behind an entrypoint script that is PID 1 via `exec`, so ECS SIGTERMs reach it for graceful shutdown. Sizing at 256 CPU units (0.25 vCPU) is where the textbook `2×cores+1` worker formula breaks down: this workload is I/O-bound — requests wait on RDS and Cognito, not the CPU — so threads are nearly free concurrency and a second worker adds crash isolation. The question that drives sizing is "what is the workload waiting on?"

**RDS now owns the database credential.** `ManageMasterUserPassword: true` on the CrdDb template makes RDS generate and manage a Secrets Manager secret; CrdDb exports the secret ARN and endpoint, CrdService imports both, ECS injects username/password from the secret's JSON keys into PG_USER/PG_PASSWORD (ExecutionRole scoped to that single ARN — no wildcards), and the entrypoint assembles CONNECTION_URL at container start, failing fast if any part is missing. No human ever sees, types, or stores the password. The empirical question of the night — is ManageMasterUserPassword compatible with snapshot restore? — could only be answered mid-deploy, because RDS's business rules live in RDS, not in cfn-lint's schema or the change-set planner. Answer: yes. RDS restored the data from the snapshot and re-keyed the credential on top of it, which also permanently dissolves the snapshot/password drift trap: secret, instance, and snapshot can no longer disagree, by construction.

**Then the deletions this earned.** With the service at steady state on the new plumbing, I deleted the SSM parameters that were now provably orphaned: CONNECTION_URL (cause of two outages, rewritten four times, leaked once — case closed) and the static AWS access keys that the Task Role obsoleted months ago. The pattern, at both layers: replace stored secrets with runtime-issued identity. One parameter survives — the OTEL headers, because the template still references it. Delete what nothing references; keep what something does. After teardown, Secrets Manager is empty: the RDS-owned secret died with its instance, and between sessions zero credentials exist anywhere in the architecture.

**A verification lesson from the agent side.** A gate grep for CONNECTION_URL flagged two hits that turned out to be comments Kiro had just written; Kiro reworded them so the count hit zero. Harmless here — but the pattern is worth naming: a check is a proxy for an intent, and when a proxy misfires, the rigorous move is to report the discrepancy for a human ruling, not to edit reality until the proxy goes quiet. In production, "make the check pass" and "satisfy what the check exists for" can diverge dangerously.

## Open items

- Re-enable the CodePipeline Build transition at next deploy (disabled while infrastructure is torn down)
- Deactivate/delete the IAM machine user's access keys at the source (SSM copies deleted; the keys themselves remain)
- Avatar optimistic-update bug (P3): new posts show a broken avatar until refresh — create_activity response lacks the avatar UUID field the home query returns
- Delete the pre-scrub backup clone and the superseded June 13 snapshot after their safety windows
- Backlog: pipeline enablement as part of deploy orchestration; gunicorn worker tuning under load; DynamoDB CFN stack (CrdDynamo)
