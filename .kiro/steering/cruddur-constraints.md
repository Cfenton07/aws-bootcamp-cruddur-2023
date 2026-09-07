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
- Do NOT delete Lambda layer `psycopg2-py13:2`. Its source is not in this repo
  and CrdAuth cannot be created without it.
- Do NOT run mutating AWS CLI commands (create/delete/update/put) unless the
  task names the command.
- Do NOT `git add`, `git commit`, `git push`, or rewrite history. Leave changes
  in the working tree for human review.
- Do NOT reformat, refactor, rename, reorder imports, or tidy code outside the
  explicit scope of the task.
- If a task instruction looks wrong or unsafe, STOP and say so before executing
  it. A challenge is more useful than compliance.

## Sources of truth

- **`aws/lambdas/cruddur-post-confirmation/lambda_function.py` is
  authoritative.** It is what `bin/cfn/auth-deploy` packages and ships.
- The `aws:json/lambdas/` directory holds STALE copies. One of them
  (`cruddur-post-confirmation.py`) contained a regression that was never
  shipped, and `cruddur-messaging-stream.py` there is UNVERIFIED against its
  deployed counterpart. Do not treat anything in `aws:json/` as correct.
- The backend does not read `PG_HOST` in Python. `bin/docker/entrypoint-prod`
  assembles `CONNECTION_URL` from `PG_USER`/`PG_PASSWORD`/`PG_HOST` at container
  start; `lib/db.py` reads the assembled value.
- Database credentials come from the CrdDb export `CrdDbDBMasterUserSecretArn`.
  Never hardcode a secret ARN — it changes on every snapshot restore.
- `aws/cfn/**/config.toml` is gitignored. Snapshot IDs and pinned image digests
  exist only on the local machine.

## Operational invariants

- Deploy order: CrdNet → CrdCluster → CrdDb → CrdService → CrdFrontend, then
  CrdAuth.
- Teardown is the reverse, with one hard rule: **CrdAuth must be deleted before
  CrdDb.** CrdAuth imports CrdDb and CrdNet exports, and CloudFormation refuses
  to delete a stack whose exports are still in use.
- **The post-confirmation Lambda is managed by CrdAuth. There is no manual step
  after a deploy.** `bin/fix-post-confirmation` has been deleted. If you find a
  reference to it anywhere, that reference is stale — report it, do not act on
  it. Never recreate it: it wrote a plaintext `CONNECTION_URL` env var onto the
  function and would overwrite CloudFormation-managed configuration.
- CrdAuth owns its own security group, so its Lambda Hyperplane ENIs cannot
  block another stack's deletion. Do not attach the function to the CrdCluster
  service security group.
- **`CONNECTION_URL` does NOT exist in an ECS Exec shell.** `entrypoint-prod`
  exports it into gunicorn's process only. `PG_USER`, `PG_PASSWORD` and
  `PG_HOST` are injected by ECS and are present. Rebuild it before running
  anything that needs it:
  `export CONNECTION_URL="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:5432/cruddur"`

## Shell hygiene in this environment

- Use `git grep`, not bare `grep`. Pipe to `| cat` — the pager captures
  keystrokes and creates junk files.
- Run `set +H` before any command containing `!` inside double quotes.
- Files must be LF-only. `.vscode/settings.json` sets `files.eol`, but verify
  with `file` or `grep -c $'\r'`.
- `bash -n` does NOT detect CRLF. It reported "syntax OK" on a file with 33
  carriage returns.
- Use `python3 -c "import ast; ast.parse(...)"`, not `py_compile` —
  `__pycache__` is root-owned from a Docker mount and `py_compile` fails EACCES.
- `@babel/parser` resolves only from `frontend-react-js/`, not the repo root.
  From the root it gives `Cannot find module` — a resolution failure that looks
  nothing like a syntax error.
- `git add` and `git rm` abort the entire command on one unmatched pathspec.
- `cmd | cat`, and `echo "exit=$?"` after a pipe, report the PIPE's status, not
  the command's. Capture exit codes without a pipe.
- A JMESPath query that matches nothing returns `None`. That is not the same as
  an empty result. Check the path before trusting the answer.
- `aws lambda get-function-configuration` with no `--query` prints environment
  variables in plaintext, including passwords. Always name the fields you want.

## Verification recipes

    python3 -c "import ast; ast.parse(open('PATH.py').read())"
    cd frontend-react-js && node -e "require('@babel/parser').parse(require('fs').readFileSync('src/PATH.js','utf8'),{sourceType:'module',plugins:['jsx']})"
    bash -n SCRIPT && grep -c $'\r' SCRIPT
    cfn-lint aws/cfn/<stack>/template.yaml   # NOT auth/template.yaml — local Code: path

## Reporting

Report honestly. A `partial` with a clear explanation is more useful than an
untrue `done`. State what you verified by RUNNING versus what you concluded by
READING — they are different levels of confidence, and conflating them has
already produced wrong conclusions in this repo. Report raw command output, not
summaries; a summary is not checkable.