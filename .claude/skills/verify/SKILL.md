---
name: verify
description: Run this project's checks (frontend lint, types, unit tests and build; backend PHPUnit, Rector and container lint) and report what passed and failed. Use after code changes, before committing, or when asked to run the tests.
---

# Verify

Run the checks for the side(s) the change touched; run both sides before a commit that spans them.

## Frontend (on the host, in `frontend/`)

Needs Node 24 (`frontend/.nvmrc`). Run `npm ci` first if `frontend/node_modules` is missing.

| Check | Command | Notes |
| --- | --- | --- |
| Lint | `npm run lint` | oxlint with the react, typescript and oxc plugins |
| Types + bundle | `npm run build` | `tsc -b` covers the app, the Worker and the Vite config, then `vite build` |
| Unit tests | `npm test` | Vitest over `src/**/*.test.ts`; `npx vitest run src/game` for just the engine |

## Backend (inside the `backend` container)

Start the stack if it is down: `docker compose up -d`, then wait until `docker compose ps` shows the backend healthy.

The suite uses the `tetris_test` database (Doctrine appends `_test` in the test env). Create it once, and
migrate it again whenever a migration is added:

```bash
docker compose exec backend php bin/console doctrine:database:create --env=test --if-not-exists
docker compose exec backend php bin/console doctrine:migrations:migrate --env=test --no-interaction
```

| Check | Command |
| --- | --- |
| Tests | `docker compose exec backend php bin/phpunit` |
| Rector (PHP 8.5 set) | `docker compose exec backend vendor/bin/rector process --dry-run` |
| Container wiring | `docker compose exec backend php bin/console lint:container` |
| Mapping vs schema | `docker compose exec backend php bin/console doctrine:schema:validate` |

`phpunit.dist.xml` sets `failOnDeprecation`, `failOnNotice` and `failOnWarning`: a deprecation is a failure
to fix at its source, never to suppress.

## Report

One line per check: the command, pass or fail, and for a failure the first failing assertion or error
verbatim. If a check could not run (Docker stopped, Node missing), say it was skipped and why. Never
report a check as passing without running it.
