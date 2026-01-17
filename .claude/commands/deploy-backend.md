---
allowed-tools: Bash(npx:*), Read
description: Type-check and deploy backend to Cloudflare Workers
---

# Deploy Backend

Deploy the Cloudflare Workers backend after type checking.

## Steps

1. First, run TypeScript type checking:
```bash
cd workers && npx tsc --noEmit
```

2. If type check passes, deploy:
```bash
cd workers && npx wrangler deploy
```

3. Report the deployment result to the user.

## Important
- NEVER deploy if type checking fails
- Report any TypeScript errors clearly
- After successful deploy, suggest running `npx wrangler tail` to monitor logs
