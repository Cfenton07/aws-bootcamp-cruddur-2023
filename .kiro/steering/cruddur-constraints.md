---
inclusion: always
---

# Cruddur — standing constraints

Applies to every task in this repo. If a task instruction conflicts with
anything here, STOP and report rather than improvising.

## Never do these without an explicit, specific instruction

- Do NOT delete KMS key `1c43b42a-3465-4e57-acc3-22deaf0d44c6`. It encrypts the
  only copy of the production database. Deleting it is unrecoverable.
- Do NOT delete any `cruddur-crddb-*` RDS snapshot.
- Do NOT run mutating AWS CLI commands (create/delete/update/put) unless the
  task names the command.
- Do NOT `git add`, `git commit`, `git push`, or rewrite history. Leave changes
  in the working tree for human review.
- Do NOT reformat, refactor, rename, reorder imports, or tidy code outside the
  explicit scope of the task.

## Sources of truth

- **Deployed Lambda code is authoritative.** The `aws:json/lambdas/` directory
  contains stale copies. One of them (`cruddur-post-confirmation.py`) contained
  a regression that was never shipped. `cruddur-messaging-stream.py` there is
  UNVERIFIED against its deployed counterpart — do not treat it as correct.
- The backend does not read `PG_HOST` in Python. `bin/docker/entrypoint-prod`
  assembles `CONNECTION_URL` from `PG_USER`/`PG_PASSWORD`/`PG_HOST` at container
  start; `lib/db.py` reads the assembled value.
- Database credentials come from the CrdDb stack export
  `CrdDbDBMasterUserSecretArn`. Never hardcode a secret ARN — it changes on
  every snapshot restore.
- `aws/cfn/db/config.toml` is gitignored. Its `DBSnapshotIdentifier` exists only
  on the local machine.

## Operational invariants

- Stack order: CrdNet → CrdCluster → CrdDb → CrdService → CrdFrontend.
  Teardown is the exact reverse.
- `./bin/fix-post-confirmation` MUST run after every `deploy-all`. Without it,
  the post-confirmation Lambda points at the previous environment and every
  signup silently fails to insert into `public.users`.
- The post-confirmation Lambda must be VPC-detached before CrdCluster is
  deleted, or its Hyperplane ENIs hold the service security group and the stack
  fails with `DependencyViolation`. `bin/cfn/teardown-all` does this.

## Shell hygiene in this environment

- Use `git grep`, not bare `grep`. Pipe to `| cat` — the pager captures
  keystrokes and creates junk files.
- Run `set +H` before any command containing `!` inside double quotes. Bash
  history expansion will mangle it (bit us on secret ARNs twice).
- Files must be LF-only. `.vscode/settings.json` sets `files.eol`, but verify
  with `file` or `grep -c $'\r'`.
- `bash -n` does NOT detect CRLF. It reported "syntax OK" on a file with 33
  carriage returns.
- Use `python3 -c "import ast; ast.parse(...)"`, not `py_compile` —
  `__pycache__` is root-owned from a Docker mount and `py_compile` fails EACCES.
- `git add` aborts the entire command on one unmatched pathspec; later paths in
  the same command are silently not staged.

## Verification recipes

```bash
python3 -c "import ast; ast.parse(open('PATH.py').read())"
node -e "require('@babel/parser').parse(require('fs').readFileSync('PATH.js','utf8'),{sourceType:'module',plugins:['jsx']})"
bash -n SCRIPT && grep -c $'\r' SCRIPT
```

## Reporting

Report honestly. A `partial` with a clear explanation is more useful than an
untrue `done`. State what you verified by running versus what you concluded by
reading — they are different levels of confidence, and conflating them has
already produced one wrong conclusion in this repo.
