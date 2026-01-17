---
allowed-tools: Bash(npx:*)
description: Monitor Cloudflare Workers logs in real-time
---

# Monitor Logs

Start real-time log monitoring for the Cloudflare Workers backend.

```bash
cd workers && npx wrangler tail
```

Note: This will run continuously. Press Ctrl+C to stop.
