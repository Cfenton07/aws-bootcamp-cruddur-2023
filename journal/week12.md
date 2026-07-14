# Week 12 — Multi-Stack CloudFormation: Building the Five-Stack Architecture

Sessions: June 27 and June 29, 2026

This was the week Cruddur's infrastructure became fully declarative. By the end of it, the entire application — networking, compute, database, backend, and frontend — deployed from five CloudFormation stacks in dependency order: **CrdNet → CrdCluster → CrdDb → CrdService → CrdFrontend**. The order isn't arbitrary: each stack exports values (subnet IDs, target group ARNs, security group IDs) that the next stack imports, so producers must exist before consumers.

## Architectural decision: separate frontend stack

Before building the frontend service, I had to decide: add it to the existing CrdService stack, or give it its own CrdFrontend stack? I chose separation, for three reasons:

1. **Blast-radius isolation.** A failed frontend deploy can't roll back a healthy backend.

2. **Independent deploy cadence.** The frontend changes on a different rhythm than the backend — especially because React `REACT_APP_*` environment variables are compiled into the bundle at Docker build time, so frontend image rebuilds have their own trigger conditions.

3. **Troubleshooting clarity.** When something breaks, a one-service stack tells you where.

The cost of separation is more teardown/deploy steps, so I recovered the convenience with orchestration scripts: `bin/cfn/deploy-all` and `bin/cfn/teardown-all`, which walk the stacks in dependency order (and reverse order for teardown) with a manual review pause at each change set.

## Five production failures, five root causes

Bringing the stacks up surfaced five distinct failures. Each one taught a principle I now check for by default.

**1. CRLF shebang.** `./bin/cfn/service-deploy` failed with `/usr/bin/env: 'bash\r': No such file or directory`. Windows line endings had crept across the WSL boundary, so the interpreter path included a carriage return. Fix: `sed -i 's/\r$//'` plus a `.gitattributes` rule `eol=lf`) so it can't regrow. Lesson: line-ending normalization across a Windows/WSL boundary is a real CI/CD failure mode, not a cosmetic one.

**2. Target type `instance` vs Fargate.** CrdService failed to create because the target groups defaulted to `instance` targets — incompatible with `awsvpc` network mode, where tasks register by ENI IP address, not instance ID. Fix: `TargetType: ip` on both target groups. Lesson: for Fargate behind an ALB, network mode, target type, and the container-port security group rule all have to agree.

**3. Duplicate target-group name on replacement.** Fixing the target type forced CloudFormation to Replace the target groups — and the replacement collided with the hardcoded `Name:` field of the resource being replaced ("CrdClusterFrontendTG already exists"). Fix: delete the hardcoded names and let CloudFormation auto-generate unique ones. Lesson: never hardcode names on resources that can be replaced.

**4. HTTP/2 health checks against the Flask dev server.** CrdService hung in CREATE_IN_PROGRESS: the target groups specified `ProtocolVersion: HTTP2`, but Flask's development server only speaks HTTP/1.1, so every ALB health check returned 505, ECS killed the task, launched a replacement, and looped forever. Fix: `ProtocolVersion: HTTP1` on both target groups. The deeper fix — running gunicorn as a production WSGI server instead of the dev server — is on the backlog. Lesson: a hung stack is often a service that can never reach steady state; read the target health, not just the stack events.

**5. Stale Route 53 aliases.** With everything deployed, the site returned DNS_PROBE_FINISHED_NXDOMAIN — the apex and api A-records still aliased a torn-down ALB from a previous deploy. I repointed them manually in the console, but flagged the real problem: DNS was manual click-ops outside my IaC, guaranteed to break on every rebuild. (Fixed properly in week 13.)

## The stale image catch

Before deploying CrdFrontend, a pre-flight check showed the frontend ECR image was last pushed in April — over two months old. That image could not contain the production backend URL, and because `REACT_APP_BACKEND_URL` is a build-time ARG baked into the bundle, no runtime setting could fix it. Deploying it would have produced a working-looking site with a silently broken feed. I rebuilt the image against `https://api.fentoncruddur.com`, pushed it, and pinned the new image in config by its immutable `@sha256` digest rather than a mutable tag — CloudFormation silently no-ops when a parameter string doesn't change, which makes `:latest` unreliable for detecting image updates.

## End-to-end milestone

With all five stacks CREATE_COMPLETE: the React app rendered over HTTPS on fentoncruddur.com, Cognito login succeeded, and my avatar loaded through the CloudFront assets pipeline. Frontend, auth, host-based ALB routing, DNS, and the serverless avatar pipeline all proven in one page load.

## The one remaining bug — root-caused

Posting a crud returned a 500 after a ~30-second delay. The diagnosis chain:

- **Network tab:** the preflight OPTIONS returned 200, ruling out CORS and ALB routing. The 30-second delay before the 500 pointed at a downstream timeout, not a code bug.

- **CloudWatch logs:** `psycopg_pool.PoolTimeout: couldn't get a connection after 30.00 sec` — the backend couldn't reach the database.

- **Hypothesis 1 (retracted):** DB security group misconfigured. Inspection showed the rule was correct — TCP 5432 from the service security group. Theory disproven by evidence.

- **Root cause:** the SSM parameter `/cruddur/backend-flask/CONNECTION_URL` pointed at the old hostname `cruddur-db-instance`, but the live restored instance was `cruddur-crddb-instance`. Flask was dialing a host that no longer existed — no TCP answer, pool timeout, 500.

The meta-lesson, and it appeared twice this week (DNS aliases, connection string): **values that should track infrastructure but are pinned manually break on every rebuild.** Both got fixed structurally in week 13.

## Principles banked

- Verify agent and tool self-reports against the actual files — a summary cannot verify content.

- Stack CREATE_COMPLETE ≠ application reachable. Read target health and DNS separately.

- Layer the diagnosis: NXDOMAIN is DNS, 503 is an ALB with no healthy target, a 30-second 500 is a downstream timeout. Attack the layer the symptom names.

- Retract disproven hypotheses explicitly and re-derive from the new evidence instead of defending the old theory.
