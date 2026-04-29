# Week 11 - Session A: cfn-toml Refactor

## What I built
Refactored bin/cfn/networking-deploy to externalize configuration
into TOML files, removing hardcoded values and reducing dependence
on shell environment variables for deploy-time settings.

## Key decisions
- Chose ruby-apt over snap for predictable system paths
- Used --user-install for cfn-toml to avoid needing sudo
- Kept CFN_BUCKET in bashrc for interactive shell convenience,
  TOML for the deploy script — two audiences, two sources
- Explicit !aws/cfn/**/config.toml.example negation in gitignore
  as defensive documentation, not just for git matching

## Verification
Deploy → review change set (18 Add resources) → execute → CREATE_COMPLETE
→ outputs match Week 10 baseline (5 exports, same export names) → teardown
→ describe-stacks confirms removal. End-to-end refactor proven.

## Loose ends
- Eric Holbrook email (Zscaler bypass request) — ready to send
- IAM Access Key 1 rotation
- RDS password in journal/week4.md (Kiro audit finding)
- .gitignore could use *.pem, *.key, __pycache__/ additions
