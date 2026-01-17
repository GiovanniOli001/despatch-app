---
allowed-tools: Bash(git:*)
argument-hint: [commit message]
description: Commit and push frontend changes to trigger Cloudflare Pages deployment
---

# Deploy Frontend

Commit and push frontend changes to deploy via Cloudflare Pages.

## Current Status
- Git status: !`git status --short`

## Steps

1. Check if there are changes to commit
2. Stage all changes: `git add .`
3. Commit with the provided message or a generated one: `git commit -m "$ARGUMENTS"`
4. Push to remote: `git push`

## Notes
- Cloudflare Pages auto-deploys in ~30 seconds after push
- Report the commit hash and remind user to check https://despatch-app.pages.dev/
