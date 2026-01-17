---
allowed-tools: Bash(curl:*)
argument-hint: [endpoint]
description: Test an API endpoint
---

# Test API Endpoint

Test an API endpoint on the live server.

## API Base
https://dispatch-api.oliveri-john001.workers.dev/api

## Test Endpoint
```bash
curl -s "https://dispatch-api.oliveri-john001.workers.dev/api/$ARGUMENTS" | jq .
```

## Common Endpoints
- `health` - Health check
- `employees` - List employees
- `vehicles` - List vehicles
- `shifts` - List shift templates
- `roster/containers` - List rosters
- `pay-types` - List pay types
- `dispatch/2026-01-17` - Get dispatch for a date
