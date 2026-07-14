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

The previous teardown run had a silent failure: the RDS `delete-db-instance` call failed, an `|| echo` swallowed the error, and the subsequent waiter returned instantly against a still`available` instance — the script reported success for a delete that never happened. The rewrite:

- Capture the delete command's output and exit code.

- On failure, distinguish `DBInstanceNotFound` (fine — already gone) from anything else (print the real error and exit non-zero).

- On success, **poll `DBInstanceStatus` until it actually reads `deleting`** before starting the long wait — so a no-op can never masquerade as success.

On its first live run tonight, the new code confirmed the state transition on the first poll `attempt 1/12: status=deleting`) — the exact spot where the old script had lied. The principle: **a script should verify state transitions, not assume that a command that didn't visibly error must have worked.** The same audit found four other `|| echo` swallows in the script; all four proved benign, because nothing downstream assumes the swallowed command succeeded — which is precisely the property that makes an error-swallow safe or dangerous.

## Credential remediation, end to end

- Redacted two dead passwords from `journal/week4.md` in the working tree (they had been rotated out previously, but plaintext credentials don't belong in a public repo even dead).

- Rotated the RDS master password during the deploy — at the pause after CrdDb restored, before CrdService launched — then rewrote the SSM parameter (Version 4) so the first backend task read the fresh value at startup.

- **The trap I caught before it fired:** rotating the password on the running instance does nothing to the restore snapshot. The next deploy would have restored an instance carrying the *old* password while SSM held the *new* one — trading last week's PoolTimeout for an auth failure. Fix: took a fresh snapshot of the instance *after* rotation `cruddur-crddb-post-rotation-20260713`) and repointed the CrdDb template and config at it. Snapshot, instance password, and SSM are now consistent by construction.

- Still open: scrubbing the old credential blobs from git history `git filter-repo`) before the PR to main. Scrubbing is hygiene, not incident response — rotation is what actually closed the exposure.

## The decisive test

With everything deployed: posted a crud with DevTools open. `POST /api/activities` returned **200 in ~42 milliseconds** — against last week's 30-second timeout and 500. Hostname fix, rotated password, security group chain, and schema all validated by one request. (One cosmetic bug logged: new posts show a broken avatar until refresh — the optimistic UI update object lacks the avatar UUID field the home query returns. App-layer, P3.)

## Open items

- Git history scrub → force-push both branches → PR `kiro-dev` → `main`

- Avatar optimistic-update bug (P3)

- Stale reminder text at the end of teardown-all (still references Gap 2 as open)

- Delete the superseded June 13 snapshot after a safety window

- Backlog: derive CONNECTION_URL from the CrdDb stack output + Secrets Manager; replace the Flask dev server with gunicorn; remove static AWS keys from SSM (Task Role makes them unnecessary)
