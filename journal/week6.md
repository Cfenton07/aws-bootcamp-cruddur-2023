# Week 6 — Deploying Containers
____________________________________________________________________

### I added Health-chacks to my backend-flask

```py
#!/usr/bin/env python3

import urllib.request

try:
  response = urllib.request.urlopen('http://localhost:4567/api/health-check')
  if response.getcode() == 200:
    print("[OK] Flask server is running")
    exit(0)  # Success exit code
  else:
    print("[BAD] Flask server is not running")
    exit(1)  # Failure exit code
except Exception as e:
  print("[BAD] Flask server is not running:", e)
  exit(1)  # Failure exit code
```

---

## Why Exit Codes Matter

When ECS runs container health checks, it looks at the **exit code**:
- `exit(0)` = healthy ✅
- `exit(1)` = unhealthy ❌

---

## File Location

Where are you putting this file? I'd suggest:

backend-flask/bin/flask/health-check
