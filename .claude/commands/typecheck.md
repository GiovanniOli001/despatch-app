---
allowed-tools: Bash(npx:*)
description: Run TypeScript type checking on the backend
---

# TypeScript Type Check

Run TypeScript type checking on the Cloudflare Workers backend.

```bash
cd workers && npx tsc --noEmit
```

Report any errors clearly, grouped by file.
