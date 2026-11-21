# Tetris

Browser Tetris with accounts and a live top-10 leaderboard. A two-app monorepo:

- `frontend/`: React 19 + TypeScript 7 SPA built with Vite 8. The board is drawn on a
  `<canvas>`; React renders only the HUD, dialogs and leaderboard. Tests: Vitest. Lint: oxlint.
- `backend/`: Symfony 8.1 JSON API on PHP 8.5, served by FrankenPHP (Caddy) with an embedded
  Mercure hub. Doctrine ORM 3 on PostgreSQL 18. Tests: PHPUnit 13. Upgrades: Rector (PHP 8.5 set).
- Hosting: the SPA and a small proxy Worker on Cloudflare (`frontend/wrangler.jsonc`,
  `frontend/worker/index.ts`), the API on Render (`render.yaml`), Postgres on Neon.

## Running it

```bash
docker compose up -d        # db + backend (dev target, ./backend bind-mounted) + frontend (Vite)
```

- App: http://localhost:8080. The frontend proxies `/api` and `/.well-known/mercure` to the backend.
- API and Mercure hub directly: http://localhost:8000. Postgres: `localhost:5432` (`tetris`/`tetris`).
- The backend entrypoint installs Composer deps on first start and runs pending migrations on every start.
- Backend commands run in the container: `docker compose exec backend php bin/console …`.
  Ignore `symfony serve` advice in `backend/AGENTS.md`; this project is Docker-only.

## How a game flows

1. `frontend/src/game/engine.ts` holds the rules. Pure, immutable rules on a 10×22 board (20 visible + 2 hidden rows). Every action
   returns a new `GameState`. SRS rotation and kick tables (`tetrominoes.ts`), 7-bag
   randomiser (`rng.ts` `nextBag`), hold, 3-piece preview, ghost piece, 500 ms lock delay
   with at most 15 resets, Guideline gravity curve. Clears pay `[0, 100, 300, 500, 800] ×
   level`; soft drop 1 point per row, hard drop 2; level = 1 + floor(lines / 10).
2. `frontend/src/game/useTetris.ts` owns the `requestAnimationFrame` loop and keyboard input; it
   feeds elapsed milliseconds into the engine (frames longer than 100 ms are clipped so a
   hidden tab does not fast-forward) and hands state to `render.ts` (canvas) and
   `src/audio/` (`sfx.ts`, `music.ts`, `notes.ts`, `useAudio.ts`), with its own Vitest tests.
3. A finished game is posted to `POST /api/scores` as `{"points": 1300, "lines": 10, "level": 2}`.
   The server cannot replay the game, so `backend/src/Dto/SubmitScoreRequest.php` rejects
   only what the rules make impossible (a plausibility bound, not proof).
4. `Leaderboard::record()` stores the score; if it lands in the top 10,
   `LeaderboardPublisher` pushes the whole list to the public Mercure topic `leaderboard`,
   and `frontend/src/leaderboard/useLeaderboard.ts` receives it over `EventSource`.

Auth is a session cookie (`json_login`, case-insensitive usernames, login throttling).
Every environment is same-origin (Vite proxy in dev, nginx in the Docker prod image, the
Worker on Cloudflare), which keeps the cookie first-party and lets SSE work without CORS.
Rate limits live in `backend/config/packages/framework.yaml`: registration per IP, score
submission per user. Errors are RFC 9457 problem+json (`App\Http\ApiProblem`), which
`frontend/src/api/client.ts` turns into `ApiError` with per-field `violations`.

## Rules that are easy to break

1. **Scoring exists twice.** The client pays points; the server re-derives the bounds.
   Change `engine.ts` and `SubmitScoreRequest.php` together, with tests on both sides.
   Use the `change-scoring-rules` skill.
2. **The engine stays deterministic.** No `Math.random`, clock, DOM, timers or network in
   `engine.ts`, `rng.ts`, `tetrominoes.ts`. Randomness comes from the seeded mulberry32 in `rng.ts`; time comes in as an argument.
3. **JSON shapes are mirrored by hand** in `frontend/src/api/client.ts`. There is no codegen.
4. **Committed migrations are immutable.** Render runs pending migrations when the container
   boots; add a new migration instead of editing an old one.
5. **A dead Mercure hub must never fail a score submission.** `LeaderboardPublisher` logs and
   moves on; clients reload the list when they reconnect.
6. **Never hardcode the API host in the SPA.** Requests are relative. The hosted API origin is
   `API_ORIGIN` in `frontend/wrangler.jsonc` (it has to live in that file: `wrangler deploy`
   drops dashboard-only vars).

## Conventions

Backend (where this repo differs from the generic Symfony advice in `backend/AGENTS.md`, follow the repo):

- `declare(strict_types=1)` everywhere. Controllers are plain `final` classes with `#[Route]`;
  they do not extend `AbstractController`. Services and DTOs are `final readonly`.
- Request bodies bind with `#[MapRequestPayload]` to a readonly DTO with `#[Assert\…]`;
  the signed-in user comes from `#[CurrentUser]`.
- Errors go through `ApiProblem::response()`; every new `/api` path needs an `access_control`
  rule in `config/packages/security.yaml` (first match wins).
- PHPUnit fails on deprecations, notices and warnings: fix them, don't silence them.

Frontend:

- TypeScript strict; `readonly` interface fields; function components and hooks; no state library.
- Rules code is plain functions over plain data and is unit-tested in `src/game/engine.test.ts`.
- Node 24 (`frontend/.nvmrc`). npm, not yarn or pnpm.

## Checks

Use the `verify` skill. Short version:

```bash
cd frontend && npm run lint && npm run build && npm test
docker compose exec backend php bin/phpunit
docker compose exec backend vendor/bin/rector process --dry-run
```

The backend suite needs the `tetris_test` database once; `verify` has the two setup commands.

## Claude Code setup in this repo

| Kind | Name | What it does |
| --- | --- | --- |
| Skill | `verify` | Runs the frontend and backend checks and reports results. Claude runs it before commits |
| Skill | `change-scoring-rules` | Checklist for changing what a game can score without breaking submissions |
| Skill | `add-api-endpoint` | Adds an endpoint the way this API is built: DTO, access rule, problem+json, test, typed client |
| Skill | `deploy` | Manual only (`/deploy`): ships the API to Render and the SPA to Cloudflare |
| Agent | `game-engine-reviewer` | Reviews engine and game-loop changes for determinism, rule bugs and missing tests |
| Agent | `score-integrity-auditor` | Checks the server's plausibility bounds against the engine: no legit game rejected, no slack |
| Agent | `dependency-upgrader` | Triages Dependabot branches and reports what is safe to merge |
| Hook | `SessionStart` | Reports the branch, pending Dependabot branches, Docker and Node availability |
| Hook | `PreToolUse` | Blocks edits to generated files, lockfiles and committed migrations; blocks `doctrine:schema:update`; asks before deleting the database volume or deploying |
| Hook | `PostToolUse` | Lints the edited file (oxlint / `php -l`), rejects non-deterministic engine code, flags scoring, API shape and schema follow-ups |

Hooks are Python 3 scripts in `.claude/hooks/` (standard library only).
