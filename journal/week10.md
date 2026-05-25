# Week 10 — CloudFormation Part 1

## What I Set Out To Do

This week marked a major shift in how I manage my Cruddur infrastructure. For the last several weeks/months, every AWS resource I touched — VPC, ECS cluster, ALB, RDS, IAM roles — was created either through the AWS Console (by clicking through screens) or through a bash script that called the AWS CLI imperatively. That works, but it leaves no version-controlled record of what the infrastructure actually looks like. If someone asked me "what does your network look like today?", my only honest answer would be "let me log into the Console and check."

Week 10 was where I started fixing that. The goal was to begin a layered migration of my entire infrastructure into AWS CloudFormation — declarative YAML templates that describe the desired state of my AWS account, version-controlled in my GitHub repo, and reproducible from a single command. I started with the foundational layer: networking. Everything else (compute, load balancing, database) sits on top of the network, so this was the right place to begin.

## The Stack I Built — CrdNet

I built a single CloudFormation stack called `CrdNet`. It defines the network foundation for the entire Cruddur application:

- **A new VPC** with CIDR `10.0.0.0/16` (65,536 private IP addresses to work with)
- **An Internet Gateway** so resources in the VPC can reach the public internet
- **Three public subnets** spread across `us-east-1a`, `us-east-1b`, and `us-east-1c` (CIDRs `10.0.0.0/24`, `10.0.1.0/24`, `10.0.2.0/24`)
- **Three private subnets** also spread across the same three Availability Zones (CIDRs `10.0.4.0/24`, `10.0.5.0/24`, `10.0.6.0/24`)
- **A public route table** with a `0.0.0.0/0` route pointing to the Internet Gateway, associated with all three public subnets
- **A private route table** with only the local VPC route, associated with all three private subnets
- **Five cross-stack exports** (`CrdNetVpcId`, `CrdNetVpcCidrBlock`, `CrdNetPublicSubnetIds`, `CrdNetPrivateSubnetIds`, `CrdNetAvailabilityZones`) — these are values that future stacks (cluster, database, services) can import via `!ImportValue` without having to know the underlying physical IDs

That's 18 resources in total in a single 230-line YAML template at `aws/cfn/networking/template.yaml`.

## Why the Layered Pattern Matters

I want to lock this concept in because it shapes everything that comes after.

In a layered IaC architecture, each "layer" of the infrastructure is its own stack. Networking is one stack. The compute cluster is a separate stack. The database is a separate stack. The services that run on top of the cluster are yet another stack. They are deliberately decoupled.

Why? Three reasons that came up over and over this week:

1. **Different lifecycles.** I tear down my ECS cluster between sessions to save money, but I'd never want to tear down the network if there's data flowing through it. Keeping them in separate stacks means I can delete the cluster without disturbing the network.
2. **Reusability.** Once I have my networking stack, multiple cluster stacks could consume its outputs. The network publishes; the consumers import. Neither needs to know about the other's internals.
3. **Blast radius.** If I make a bad change to one stack, the failure is contained to that stack. Mixing networking and compute into one giant template means one typo can break everything.

This is the textbook AWS pattern, and following it from the start gives my project a much stronger story for interviews.

## The Tools I Set Up

A few new pieces of tooling joined my workflow this week:

- **`cfn-lint` 1.49.3** — a linter for CloudFormation templates. It catches YAML syntax errors, invalid property references, and AWS-specific issues (like trying to assign a property that doesn't exist on a resource type) *before* you ever attempt a deploy. I installed it via `pip3` and now every deploy script starts with a `cfn-lint` call as a guard rail.
- **`pip3`** — needed installing first; came in via `apt`. A reminder that even my dev environment is something I'm assembling as I go.
- **An S3 artifacts bucket** — `cfn-artifacts-cruddur-cf-1354`. CloudFormation uploads templates to S3 during the `aws cloudformation deploy` flow, so this bucket is now a permanent part of my project's environment.

## The Deploy Script Pattern — `--no-execute-changeset`

This is one of the most important habits I formed this week, and it's worth its own section.

When you deploy a CloudFormation template, by default `aws cloudformation deploy` will create a change set, then immediately execute it. That's fine for trivial changes, but it's terrifying for anything that touches real infrastructure — because by the time you find out what's about to happen, it's already happening.

The fix is `--no-execute-changeset`. With that flag, the deploy command creates the change set and stops. It tells me, "here's a description of what would change — go review it in the Console, and if you approve, click Execute yourself."

My deploy script at `bin/cfn/networking-deploy` follows this pattern:

```bash
#!/usr/bin/env bash
set -e
CFN_PATH="aws/cfn/networking/template.yaml"

cfn-lint $CFN_PATH

aws cloudformation deploy \
  --stack-name CrdNet \
  --s3-bucket $CFN_BUCKET \
  --region us-east-1 \
  --template-file $CFN_PATH \
  --no-execute-changeset \
  --tags group=cruddur-networking \
  --capabilities CAPABILITY_NAMED_IAM
```

In an interview I'd describe this as the "production-safe deploy pattern" — eliminates a whole class of "I didn't realize this would replace the resource" incidents. It's also exactly how a real-world enterprise CI/CD pipeline should be wired: build a change set, post it for review, require a human approval before executing.

## Three Full Deployment Cycles

I deployed `CrdNet` three different times this week, on purpose:

**Deploy #1 — Initial creation.** First run of the deploy script. cfn-lint passed silently. Template uploaded to S3. Change set created with 18 Add actions. Reviewed in the Console (every action, every resource type). Executed. Stack reached `CREATE_COMPLETE` in about 25 seconds.

**Deploy #2 — Outputs fix.** I caught a problem during my four-layer verification (more on that below): the Outputs tab was empty. I had forgotten to actually include the `Outputs` section in the template, which meant my five cross-stack exports didn't exist yet. I appended the Outputs section via a heredoc, redeployed, reviewed the change set (which showed only Modify actions on the existing stack), and executed.

**Deploy #3 — Full teardown and rebuild.** This was the one I'm proudest of. I ran `aws cloudformation delete-stack --stack-name CrdNet`, watched the 18 resources delete in reverse-dependency order (Route Table Associations first, then Routes/Subnets/IGW attachment, then VPC last). Verified in the Console that my account was back to a pre-Cruddur state (only the default VPC remained). Then I ran `./bin/cfn/networking-deploy` again — same template, no changes — and watched 18 resources come back in roughly the same 25 seconds. Same logical structure, brand-new physical IDs. That's the IaC promise made real: an entire production-style network environment, gone and back in under two minutes from a single YAML file.

## Verify All Four Layers — Lesson Learned

Deploy #1 finished with a green `CREATE_COMPLETE` banner. If I had stopped there I would have shipped a broken stack.

The mistake was treating the stack status as the only truth. CloudFormation can absolutely report `CREATE_COMPLETE` while the *content* of the stack is wrong — for example, when the Outputs section is missing entirely. The status only tells you "everything I tried to create, I created." It doesn't tell you "everything you intended is here."

The fix is a four-layer Console verification I now run after every deploy:

1. **VPC Console → Your VPCs.** Is the new VPC present with the right CIDR?
2. **VPC Console → Subnets.** Are all six subnets there, in the right AZs, with the right CIDRs?
3. **VPC Console → Route Tables.** Are both route tables present, with the right routes, and associated with the right subnets?
4. **CloudFormation → Stack → Outputs tab.** Are all five exports listed?

It was step 4 that caught my Outputs bug. Now I always do all four, every time, even when the deploy "looks fine."

## Debugging Case Studies

Week 10 was as much a tooling and workflow shakedown as it was an IaC project. Several gnarly issues came up, and I want to document the ones that taught me something durable.

### Kiro IDE Source Control panel — unreliable

I started the week trying to use Kiro's built-in Git UI. Within an hour I had three separate situations where the panel showed files as modified when terminal `git status` showed them clean, and one where it surfaced an "Initialize Repository" button on a directory that already had a 321-commit history. If I had clicked it, I could have lost everything.

The lesson: **the terminal is the authoritative source of truth for Git.** IDE Source Control panels are nice when they work, but they cache state aggressively and can misrepresent the repo. From this point forward, every Git operation goes through the terminal. I verify status, stage, commit, push, pull, and merge with `git` directly. The IDE is for editing files; nothing more.

### WSL versus Windows filesystem boundary

Launching Kiro from Windows pointed it at a Windows-side file path. Git inside WSL couldn't recognize my repo because the file ownership looked wrong (Windows files mounted into WSL show up with different owners than WSL-native files).

The fix: I always launch Kiro from inside the WSL terminal by running `kiro .` from my repo directory. That way Kiro inherits the WSL environment and Git works normally. Belt-and-suspenders: I also ran `git config --global --add safe.directory $(pwd)` to whitelist my repo with Git's ownership protection.

### CRLF versus LF line endings

When I created a shell script on Windows and ran it inside WSL, I got an error that read `bash\r`. That trailing `\r` was the Carriage Return character — Windows uses CRLF (`\r\n`) to end lines while Linux uses LF (`\n`). My shell script had been silently corrupted with Windows line endings.

Fix one-time: `sed -i 's/\r$//' bin/cfn/networking-deploy`. Fix permanently: I added a `.gitattributes` file telling Git to force LF on all shell scripts regardless of operating system.

### Rogue branch on GitHub

Earlier in the week, an accidental PowerShell commit had created a divergent `kiro-dev` branch on GitHub that no longer matched what was in WSL. Trying to push from WSL produced a "diverged history" error. I considered just force-pushing, but `git push --force` is genuinely dangerous — it can overwrite a teammate's work if you don't know exactly what you're doing.

The correct fix was `git reset --hard origin/main` (to bring my local branch back in sync with `main`), then `git push --force-with-lease origin kiro-dev`. The `--force-with-lease` variant refuses to push if the remote has changed since I last fetched it — so even if I'm wrong about the state of the remote, I can't accidentally clobber someone else's commits.

## SSL Bypass — Corporate Constraints

A non-technical but important thread this week: my work laptop runs Zscaler SSL inspection and CrowdStrike Falcon Sensor. Both interfere with certain dev workflows — pulling from Docker Hub, opening tunnels via GitHub Codespaces, and reaching AWS ECR Public can all fail with TLS errors because Zscaler is replacing the upstream certificate with its own. I have a working bypass for AWS CLI traffic (`AWS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt` in my `.bashrc`) but Docker and a few other tools need explicit per-domain rules.

I drafted a consultative email to Antwaun, my director of Cloud Operations, asking for guidance on whether I should approach Eric Holbrook in CT Cyber Security directly with a request to whitelist specific domains. Two variants of the email were prepared — a longer consultative version and a shorter direct-request version — both with placeholders for the relevant screenshots and exact error messages.

This sits open as I move into Week 11. The takeaway here is that "corporate security policy" is part of the cloud engineering job too. Not every blocker is technical, and knowing how to escalate professionally is itself a skill.

## Branch and PR Workflow

All of this week's work happened on the `kiro-dev` branch. At the end of the week I opened PR #2 against `main`:

- **Title:** Week 10: CloudFormation networking stack (Kiro dev)
- **Base:** main, **Compare:** kiro-dev
- **2 commits, 3 files changed**
- Merged as commit `c9553b8` via "Create a merge commit" (the default option in GitHub's PR merge dialog)

After the merge I synced my local `main`, deleted the local `kiro-dev` branch, and confirmed both branches were clean. This is the same flow I'll use for every IaC stack going forward.

## What This Looks Like on My Resume

If an interviewer asks "have you used CloudFormation?" I now have a real answer. I built a networking stack from scratch: VPC, IGW, six subnets across three AZs, two route tables, six route table associations, and five cross-stack exports. I deployed it three times — once to create, once to fix a missing Outputs section, and once as a full teardown-and-rebuild — to prove the IaC promise that an entire networking environment is reproducible from a single YAML file.

I used the `--no-execute-changeset` pattern so every deploy goes through a human-reviewed change set in the Console before applying. I caught a Outputs bug because I run a four-layer verification (VPC, Subnets, Route Tables, Outputs) after every deploy rather than trusting the stack status alone. The work is committed to my public GitHub repo, merged through PR #2 with the layered cross-stack export pattern documented in the template's comments.

It's a real artifact I can walk an interviewer through line by line.

## Commands Reference

```bash
# Install cfn-lint
pip3 install cfn-lint

# Deploy (creates change set, does NOT execute)
./bin/cfn/networking-deploy

# Execute the change set from the Console:
# CloudFormation → CrdNet → Change sets → [latest] → Execute

# Verify deploy
aws cloudformation describe-stacks --stack-name CrdNet \
  --query "Stacks[0].Outputs" --output table

# Tear down (asynchronous; takes ~30 seconds)
aws cloudformation delete-stack --stack-name CrdNet

# Confirm teardown
aws cloudformation describe-stacks --stack-name CrdNet
# Expected: "Stack with id CrdNet does not exist"

# Fix Windows line endings on a shell script
sed -i 's/\r$//' bin/cfn/networking-deploy

# Safe forced push (refuses if remote moved)
git push --force-with-lease origin kiro-dev
```

## Progress Checklist

- [x] Install `pip3` and `cfn-lint` 1.49.3 in WSL Ubuntu 24
- [x] Create `cfn-artifacts-cruddur-cf-1354` S3 bucket for template uploads
- [x] Write `aws/cfn/networking/template.yaml` with VPC, IGW, six subnets, two route tables, six RTAs
- [x] Add Outputs section with five cross-stack exports (`CrdNetVpcId`, `CrdNetVpcCidrBlock`, `CrdNetPublicSubnetIds`, `CrdNetPrivateSubnetIds`, `CrdNetAvailabilityZones`)
- [x] Write `bin/cfn/networking-deploy` using `--no-execute-changeset` pattern
- [x] Deploy #1 — initial creation, verified in Console (all four layers)
- [x] Deploy #2 — corrective update after catching missing Outputs section
- [x] Deploy #3 — full teardown and rebuild to prove reproducibility
- [x] Resolve Kiro IDE Source Control panel cache bugs by moving Git workflow to terminal-only
- [x] Resolve WSL/Windows filesystem boundary by launching Kiro from inside WSL
- [x] Resolve CRLF line-ending corruption on shell scripts with `sed` and `.gitattributes`
- [x] Resolve rogue `kiro-dev` branch on GitHub via `git reset --hard` and `git push --force-with-lease`
- [x] Tear down `CrdNet` stack for cost discipline at end of session
- [x] Open PR #2 from `kiro-dev` into `main`
- [x] Merge PR #2 as commit `c9553b8`
- [x] Sync local and remote branches; confirm working tree clean
- [x] Draft SSL inspection bypass email to Antwaun (two variants)
- [ ] Receive Antwaun's guidance on whether to approach Eric Holbrook directly for SSL bypass (carried into Week 11)
