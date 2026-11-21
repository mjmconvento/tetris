---
name: add-api-endpoint
description: Add or change a JSON endpoint in the Symfony API the way this codebase builds them (readonly DTO plus MapRequestPayload, access_control rule, problem+json errors, WebTestCase test, typed client in frontend/src/api/client.ts). Use when a feature needs new server data or a new action.
---

# Adding an API endpoint

Model it on `backend/src/Controller/ScoreController.php`, which shows every piece.

1. **Route.** A method on a `final` controller class (no `AbstractController`), routed with
   `#[Route('/api/…', name: 'api_…', methods: [...])]`. The class-level route sets `format: 'json'`.
   Check `docker compose exec backend php bin/console debug:router` for name clashes.
2. **Input.** Request bodies bind with `#[MapRequestPayload]` to a `final readonly` DTO in
   `src/Dto/` with `#[Assert\…]` constraints; query strings with `#[MapQueryString]`. Symfony
   answers invalid input with a 422 problem+json listing the violations, which the frontend's
   `ApiError` already reads per field. Do not decode JSON by hand.
3. **User.** `#[CurrentUser] User $user` for signed-in actions.
4. **Access.** Add a rule to `access_control` in `config/packages/security.yaml`. Only the first
   match applies, so put specific paths above broader ones (see the `/api/scores/top` rule).
5. **Logic.** Keep the controller thin; put behaviour in a `final readonly` service (autowired,
   no YAML), like `src/Leaderboard/Leaderboard.php`. Abuse-prone writes get a rate limiter in
   `config/packages/framework.yaml`, injected as `RateLimiterFactoryInterface $<name>Limiter`.
6. **Errors.** Return `ApiProblem::response($status, $detail)` for expected failures (409 on a
   duplicate, 429 with `Retry-After`).
7. **Schema.** An entity change needs a migration:
   `docker compose exec backend php bin/console make:migration`, then read the generated SQL.
8. **Test.** Extend `tests/Api/LeaderboardApiTest.php` (or add a sibling `WebTestCase`): drive it
   with `$this->client->jsonRequest()` the way the SPA does, covering success, validation failure
   and the signed-out response.
9. **Client.** Add a typed function and a `readonly` response interface to
   `frontend/src/api/client.ts`; the shapes are mirrored by hand.
10. Run the `verify` skill.
