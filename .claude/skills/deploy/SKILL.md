---
name: deploy
description: Ship Tetris to production (API on Render, SPA on Cloudflare Workers, Postgres on Neon).
disable-model-invocation: true
---

# Deploy

Production is three services. Confirm with the user before each step that touches production.

## 0. Preconditions

- `main` is green: run the `verify` skill.
- `git status` is clean and `main` is pushed (Render builds from GitHub).

## 1. API (Render)

`render.yaml` deploys `backend/` as a Docker web service with `autoDeployTrigger: commit`, and its
`rootDir: backend` means **only commits that touch `backend/` trigger a deploy**. Pushing such a
commit to `main` is the deploy. The container runs pending Doctrine migrations at boot
(`backend/frankenphp/docker-entrypoint.sh`), so a migration ships with the code.

After it is live:

```bash
curl -fsS https://<render-host>/healthz          # Caddy only, never wakes the database
curl -fsS https://<render-host>/api/scores/top   # PHP + Neon
```

The free plan sleeps after idling; the first request can take about a minute.

## 2. SPA + proxy Worker (Cloudflare)

```bash
cd frontend
npm ci
npm run build      # wrangler serves ./dist, it does not build it
npm run deploy     # wrangler deploy
```

The Worker proxies `/api/*` and `/.well-known/mercure*` to `API_ORIGIN` in `wrangler.jsonc`. Change
that value in the file, never only in the dashboard: `wrangler deploy` deletes plain-text vars that
the file does not declare.

## 3. Smoke test

Open the Workers URL, register a throwaway account, finish a game, and check the score appears on
the leaderboard in a second tab without reloading (that proves Mercure through the Worker).

## Things that are never automatic

- PostgreSQL major upgrades (Dependabot ignores them): they need a dump and restore.
- The FrankenPHP image's PHP patch version (`dunglas/frankenphp:1-php8.5.x` in `backend/Dockerfile`);
  Dependabot cannot bump that suffix, so it is a manual edit.
