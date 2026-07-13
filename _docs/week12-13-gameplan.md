# Cruddur — Week 12–13 Session Log & Next-Session Game Plan

**Multi-Stack CloudFormation Deploy:** CrdNet → CrdCluster → CrdDb → CrdService
**Account** 931637612335 · **Region** us-east-1 · **Domain** fentoncruddur.com
**Session date:** June 27, 2026

---

## 1. Executive Summary

Brought up the full **backend** infrastructure and proved the backend live end-to-end over HTTPS on the production domain. Four stacks deployed in dependency order (CrdNet → CrdCluster → CrdDb → CrdService), five production failures diagnosed and fixed, then everything torn down for cost discipline.

- **Outcome:** Backend confirmed live. `https://api.fentoncruddur.com/api/health-check` → `{ "success": true, "version": 1 }`.
- **Root domain returns 503** because the **frontend ECS service has not been built yet** — this is the headline task for next session, NOT a bug.
- **End state:** All four Crd stacks deleted, retained RDS instance deleted, orphaned log group cleared, NAT Gateway/EIP released. Only `ThumbnailServerlessCdkStack` and `CDKToolkit` remain (intentional).

---

## 2. What Was Deployed (and Verified)

**CrdNet — Networking:** 21 resources. VPC, IGW, 6 subnets/3 AZs, route tables. NAT Gateway added this session (NatGatewayEIP, NatGateway in a public subnet, PrivateRouteToInternet). Verified private route `0.0.0.0/0 → nat-011e8135f28f41ee9` — egress proof for the Option A private-subnet design.

**CrdCluster — Compute & LB:** 9 resources. ECS Fargate cluster (Container Insights on), ALB (public subnets), ALB SG, Service SG, two target groups, HTTPS + HTTP listeners, api-host listener rule. Host-based routing: HTTPS default → frontend TG; `api.fentoncruddur.com` host header → backend TG. Exports: `CrdClusterServiceSGId`, `CrdClusterBackendTGArn`, `CrdClusterFrontendTGArn`.

**CrdDb — Database:** RDS PostgreSQL 17.4, restored from snapshot into private subnets, `PubliclyAccessible: false`. `DeletionPolicy: Retain` + `UpdateReplacePolicy: Retain`. Explicit DBLogGroup removed so RDS owns its own log group. Final change set = 3 resources (DBSecurityGroup, DBSubnetGroup, Database).

**CrdService — Backend App:** 5 resources (ExecutionRole, TaskRole, LogGroup, TaskDefinition, Service) for backend-flask. SHA-pinned image, `AssignPublicIp: DISABLED`, private-subnet placement, Task Role IAM auth (no static keys). Verified live through the full production path.

---

## 3. Failures Diagnosed & Resolved (interview-ready)

| Failure | Root cause | Fix & principle |
|---|---|---|
| **CRLF shebang** | service-deploy script had Windows line endings; `bash\r` not found | `sed -i 's/\r$//'` + `.gitattributes` `eol=lf`. Line-ending normalization across Windows/WSL is a real CI/CD gotcha. |
| **Target type = instance** | TGs defaulted to instance type; incompatible with Fargate awsvpc | Added `TargetType: ip` to both TGs. awsvpc tasks register by ENI IP, not instance ID. |
| **Duplicate TG name** | Replacing an immutable property with a hardcoded Name → new TG collides with old | Removed the hardcoded `Name` so CFN auto-generates unique names → replacement-safe. |
| **HTTP/2 health check** | TGs set `ProtocolVersion: HTTP2`; Flask dev server only speaks HTTP/1.1 → 505 on every ALB health check → task killed in a loop → stack hung | Changed both TGs to `ProtocolVersion: HTTP1`. Deeper fix = gunicorn in front of Flask (study item). |
| **Stale Route 53 records** | Apex + api A-records aliased to a torn-down ALB → NXDOMAIN | Repointed both records to the new ALB. DNS is manual click-ops — codify into IaC (Gap 2). |

**Bonus (teardown):** CrdDb hit DELETE_FAILED because the DBSubnetGroup couldn't delete while the retained RDS instance still used it. Delete the instance first, then retry the stack delete — textbook `DeletionPolicy: Retain` teardown-order dependency.

---

## 4. Template Gaps to Fix Before Next Deploy (priority order)

**Gap 1 — Frontend ECS service does not exist (HIGHEST PRIORITY)**
- Symptom: root domain returns 503 — ALB has no healthy target in FrontendTG.
- Cause: CrdService defines only the backend-flask task def + service. No frontend.
- Fix: add a frontend task definition + ECS service (own stack `CrdFrontend`, or a second service in CrdService) running the React/nginx image on port 3000, registered into `CrdClusterFrontendTGArn`.
- **Remember:** React env vars are compiled at BUILD time. The frontend image must be rebuilt against the live `api.fentoncruddur.com` URL before deploy, or its API calls point to the wrong place.

**Gap 2 — DNS records are not in IaC**
- Twice a torn-down/rebuilt ALB left Route 53 pointing at a dead LB.
- Fix: add `AWS::Route53::RecordSet` resources (alias A-records for apex + api, target = ALB) into CrdCluster so DNS re-wires automatically on every rebuild.

**Gap 3 — Bake tonight's TG fixes into the committed template**
- Confirm both TGs carry `TargetType: ip`.
- Confirm both TGs use `ProtocolVersion: HTTP1` (until gunicorn lands).
- Confirm neither TG hardcodes a `Name` (let CFN auto-generate).
- Confirm the CRLF fix + `.gitattributes eol=lf` rule are committed.

**Gap 4 — Confirm CrdDb log-group ownership stays with RDS**
- Keep the explicit DBLogGroup out. If a stale `/aws/rds/instance/cruddur-crddb-instance/postgresql` log group lingers after teardown, delete it before redeploying CrdDb or EarlyValidation fails.

---

## 5. Next-Session Game Plan (step by step)

**Phase 0 — Pre-flight**
1. Open WSL terminal in repo. Run: `git status`, `aws sts get-caller-identity`, `aws iam list-access-keys`.
2. Confirm no Crd stacks exist (all "does not exist").
3. Check for orphaned RDS log group and delete if present:
   `aws logs describe-log-groups --log-group-name-prefix /aws/rds/instance/cruddur-crddb-instance --query 'logGroups[*].logGroupName' --output table`

**Phase 1 — Apply template fixes (before any deploy)**
1. Gap 1: author the frontend task definition + ECS service (CrdFrontend stack or 2nd service).
2. Gap 2: add Route 53 alias RecordSets to CrdCluster (apex + api → ALB).
3. Verify Gap 3 fixes already in committed cluster template (ip / HTTP1 / no hardcoded Name).
4. Rebuild the frontend React image against the live backend URL, push to ECR, capture new image SHA for config.toml.
5. Lint everything: `cfn-lint` each template until clean.

**Phase 2 — Deploy in dependency order**
1. CrdNet → ~21 resources, all Add. Verify NAT egress route after.
2. CrdCluster → cluster, ALB, listeners, both TGs (ip/HTTP1), SGs, new Route 53 records. ALB is the slow resource.
3. CrdDb → 3 resources; Database CREATE_IN_PROGRESS ~8–15 min on snapshot restore. Confirm Retain policies in change set.
4. CrdService (backend) → task RUNNING/HEALTHY; verify `api.fentoncruddur.com/api/health-check`.
5. CrdFrontend (or frontend service) → registers into FrontendTG and goes HEALTHY.

**Phase 3 — End-to-end verification**
1. Confirm both target groups healthy (describe-target-health on Frontend + Backend TG ARNs).
2. If DNS was just repointed: `ipconfig /flushdns`, then `nslookup fentoncruddur.com 8.8.8.8`.
3. Load `https://fentoncruddur.com`, log in via Cognito, exercise home feed (hits /api/* → backend).
4. If feed errors: DevTools Network + CORS OPTIONS one-liner to see whether Flask or nginx answers.

**Phase 4 — Commit & tear down**
1. Commit the verified milestone (frontend service + Route 53 IaC + TG fixes).
2. Tear down in reverse order (see card below).

---

## 6. Teardown Reference Card (reverse dependency order)

Order: **CrdFrontend → CrdService → CrdDb → CrdCluster → CrdNet** (delete consumers before producers).

```bash
# Frontend & backend services
aws cloudformation delete-stack --stack-name CrdFrontend
aws cloudformation wait stack-delete-complete --stack-name CrdFrontend
aws cloudformation delete-stack --stack-name CrdService
aws cloudformation wait stack-delete-complete --stack-name CrdService

# CrdDb — retained-instance catch: two manual cleanups
aws cloudformation delete-stack --stack-name CrdDb
aws cloudformation wait stack-delete-complete --stack-name CrdDb
# Stack delete leaves the RDS instance (DeletionPolicy: Retain).
# Delete it FIRST, then the log group, or the next deploy breaks:
aws rds delete-db-instance --db-instance-identifier cruddur-crddb-instance --skip-final-snapshot
aws logs delete-log-group --log-group-name /aws/rds/instance/cruddur-crddb-instance/postgresql

# Cluster, then network last (NAT Gateway + EIP billing stops here)
aws cloudformation delete-stack --stack-name CrdCluster
aws cloudformation wait stack-delete-complete --stack-name CrdCluster
aws cloudformation delete-stack --stack-name CrdNet
aws cloudformation wait stack-delete-complete --stack-name CrdNet
```

If CrdDb shows DELETE_FAILED: the subnet group is blocked by the still-deleting instance. Wait for the instance to reach "not found," then re-run `delete-stack --stack-name CrdDb`. Recoverable.

**Verify clean:** loop `describe-stacks` over all five (want "does not exist"); `aws rds describe-db-instances --db-instance-identifier cruddur-crddb-instance` should say "not found".

Remember: after teardown, Route 53 records again point at a dead ALB until Gap 2 (DNS in IaC) is done — then it self-heals on the next deploy.

---

## 7. Principles Bank (interview-ready)

- **awsvpc means IP targets** — three properties must agree: network mode awsvpc (task def), target type ip (TG), health check + SG on container port (4567).
- **Don't declare what AWS manages** — the explicit DBLogGroup fought RDS for its auto-created log group; removing it ended the collisions.
- **Don't hardcode replaceable resource names** — immutable property changes force replacement; a hardcoded Name then collides. Auto-generated names are replacement-safe.
- **Retain creates teardown coupling** — a retained RDS instance blocks its subnet group from deleting. Delete the retained resource first.
- **Stack complete ≠ app reachable** — CREATE_COMPLETE means CFN is satisfied; the app still needs healthy targets + correct DNS. A 503 is the ALB correctly reporting no healthy target.
- **Layer the diagnosis** — NXDOMAIN = DNS; 503 = ALB has no target; CORS/405 from nginx = routing. Attack the right layer.
- **Dev server vs production WSGI** — the HTTP/2 failure traces to running Flask's dev server in production. Real fix = gunicorn.

**Master narrative:** "I deployed a containerized full-stack app as separate frontend and backend ECS services behind a single ALB using host-based routing. I brought the backend online first and validated it end-to-end through a health-check endpoint over HTTPS, then identified the root domain's 503 as the load balancer correctly reporting no healthy frontend target — because the frontend service was a separate deployment still pending. Along the way I debugged the awsvpc IP-target requirement, an HTTP/2-versus-dev-server health-check incompatibility, a target-group name collision on replacement, and a stale DNS alias left by an infrastructure rebuild."

---

## 8. Status Snapshot at Session Close

| Item | State | Note |
|---|---|---|
| All four Crd stacks | Deleted | Verified "does not exist" |
| Retained RDS instance | Deleted | skip-final-snapshot; snapshot retained for restore |
| Orphaned RDS log group | Cleared | Prevents EarlyValidation collision next deploy |
| NAT Gateway + EIP | Released | Hourly billing stopped |
| Backend application | Proven live | health-check returned success JSON before teardown |
| Frontend service | Not built | Headline task next session (Gap 1) |
| Route 53 in IaC | Not yet | Manual records; codify (Gap 2) |
| Snapshot for restore | Retained | cruddur-db-pre-crddb-20260613 |
| Remaining stacks | Intentional | ThumbnailServerlessCdkStack, CDKToolkit |

**Bottom line:** backend proven on a real domain, environment clean, costs at zero. Next session = one new service (frontend) + two template hardening items (frontend in IaC, Route 53 in IaC) away from full end-to-end.

---

## Reconciliation note (from the Kiro build session)

The scaffold built in the Kiro session set the service subnets to **PrivateSubnetIds** (Option A) and removed the static AWS access-key secrets (Task Role auth). The cluster TG `ProtocolVersion` was changed **HTTP2 → HTTP1** in `aws/cfn/cluster/template.yaml` (committed). Per this game plan, also confirm both TGs have `TargetType: ip` and no hardcoded `Name` — verify these are present in the committed cluster template at the start of next session (Gap 3).
