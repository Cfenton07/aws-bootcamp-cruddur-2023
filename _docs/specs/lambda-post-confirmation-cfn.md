# Spec — define the post-confirmation Lambda in CloudFormation

Status: DESIGN. Not implemented.

## Problem

`cruddur-post-confirmation` exists only as click-ops. Nothing in the repo
creates it, and nothing recreates it after a rebuild. When the app migrated to
CloudFormation the function was left behind in the default VPC, pointing at the
legacy RDS instance with stale credentials, silently failing every signup's
insert into `public.users` for an unknown period. `bin/fix-post-confirmation` is
a workaround: it rewrites configuration on a function it assumes already exists.

## Goal

A rebuild recreates a correctly-wired function with no manual step.

## Requirements

1. Function defined in CloudFormation, deployed by a `bin/` script consistent
   with the existing `*-deploy` convention.
2. VPC config sourced from CrdNet exports — never hardcoded subnet IDs.
3. DB endpoint sourced from the CrdDb export.
4. Credentials read from Secrets Manager **at runtime**, not held in an
   environment variable. Survives the 7-day managed-secret rotation.
5. `secretsmanager:GetSecretValue` scoped to the CrdDb-exported ARN, not `*`.
6. Failures raise. Cognito must see the error; the Lambda error metric must fire.

## Design decisions to make (resolve before implementing)

**D1 — Where does it live?**
New stack (e.g. `CrdAuth`) deployed after CrdDb, or added to CrdService?
Leaning new stack: it depends on CrdNet + CrdDb but not on ECS, and a separate
lifecycle keeps teardown ordering explicit.

**D2 — Its own security group, or reuse the CrdCluster service SG?**
Leaning its own, defined in the new stack. Reusing CrdCluster's SG is what
created the teardown `DependencyViolation`. With its own SG, the Lambda stack
owns and removes it. The DB ingress rule then goes in the Lambda stack as a
standalone `AWS::EC2::SecurityGroupIngress` referencing the imported DB SG id —
this avoids a circular dependency, since CrdDb deploys first.

**D3 — The existing function already has that name.**
CloudFormation will fail with "already exists" if it tries to create
`cruddur-post-confirmation`. Two paths:
  (a) Delete the existing function, then deploy. Simple; signups break for the
      few minutes in between. Acceptable in a maintenance window.
  (b) CloudFormation resource import (`--change-set-type IMPORT`). No downtime,
      more machinery, and a genuinely useful thing to learn.
Note the ARN is derived from name + region + account, so as long as the name is
preserved the existing Cognito trigger keeps working either way.

**D4 — The Cognito trigger attachment.**
The user pool is not managed by CloudFormation, so a template cannot add a
`LambdaConfig` to it. The trigger must stay a one-time CLI/console step. Document
it; verify it with
`aws cognito-idp describe-user-pool --query 'UserPool.LambdaConfig'`.

**D5 — Code packaging.**
Do NOT use inline `Code.ZipFile` — that duplicates the handler into the template
and recreates the drift problem this whole exercise exists to fix. Use
`aws cloudformation package` (or an explicit zip + S3 upload) against the
existing artifacts bucket, with `aws/lambdas/cruddur-post-confirmation/` as the
single source.

**D6 — The psycopg2 layer.**
The deployed function uses
`arn:aws:lambda:us-east-1:931637612335:layer:psycopg2-py13:2`, whose source is
not in the repo. Recovering the handler did not make the function reproducible.
Minimum viable: pass the layer ARN as a template parameter and document how the
layer was built. Better later: build it in CI.

**D7 — Secrets Manager reachability.**
A Lambda in private subnets reaches the Secrets Manager API via the NAT Gateway.
Works today. A VPC endpoint would be cheaper and more private — note as a
follow-up, not a blocker. Cache the secret in module scope so it is fetched once
per cold start, not once per invocation.

## Acceptance criteria

- `deploy-all` from a torn-down state produces a working signup with NO manual
  Lambda step.
- A throwaway signup writes a row to `public.users`; the user appears on the
  People page and can send a message.
- Forcing a secret rotation does not break signup.
- Teardown completes without a `DependencyViolation` on CrdCluster.
- No secret value appears in any template, task definition, or env var.

## Out of scope

- Building the psycopg2 layer from source.
- Auditing `cruddur-messaging-stream`, `cruddur-upload-avatar`, or
  `lambda-authorizer`, none of which have deploy automation either.
- Retiring `bin/fix-post-confirmation` — keep it until the stack is proven, then
  delete it in a separate commit.
