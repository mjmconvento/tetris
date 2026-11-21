---
name: change-scoring-rules
description: Checklist for changing anything that affects what a Tetris game can score (point values, multipliers, level or stage pacing, board size). Use whenever engine scoring constants or backend/src/Dto/SubmitScoreRequest.php change.
---

# Changing the scoring rules

The game runs in the browser, so the server cannot know what really happened. It defends the
leaderboard with a **plausibility bound**: `SubmitScoreRequest` rejects submissions the rules
make impossible. That bound is computed from the same constants the engine uses to pay points,
so the two files must move together.

- Too tight, and a legitimate run is rejected with a 422 after the player finishes: the worst
  failure, because their game is lost.
- Too loose, and the bound protects nothing.

The target is the **loosest bound the rules allow, and no looser**.

## Where each rule lives

| Rule | Frontend (`engine.ts`) | Backend (`SubmitScoreRequest.php`) |
| --- | --- | --- |
| Level formula | `levelFor`: 1 + floor(lines / `LINES_PER_LEVEL` = 10) | `LINES_PER_LEVEL = 10`, checked in `validatePlausibility()` |
| Best clear pay | `LINE_POINTS[4] = 800` for four lines, so 200 per line per level | `MAX_POINTS_PER_LINE_PER_LEVEL = 200` |
| Drop points per piece | `HARD_DROP_POINTS` (2) × `ROWS` (22) = 44 at most | `MAX_DROP_POINTS_PER_PIECE = 50` |
| Board cells in the piece bound | `COLS` (10) × `VISIBLE_ROWS` (20) = 200 | `intdiv(10 * $lines + 200, 4)` inside `maxPlausiblePoints()` |
| Upper bound on points | none: the bound exists only on the server | `maxPlausiblePoints(lines, level)` |

There is no frontend copy of `maxPlausiblePoints`, so nothing on the client fails when the bound goes stale: re-derive it by hand from `LINE_POINTS`, the drop points and the board size whenever any of them changes.

## Steps

1. Change the engine and keep `frontend/src/game/engine.test.ts` green; add a test for the new rule.
2. Work out the new best case by hand: the highest-paying way to reach a given
   `lines`/`level` pair. Write the derivation into the DTO's docblock as the existing
   constants do.
3. Update the matching constants and `maxPlausiblePoints()` in
   `backend/src/Dto/SubmitScoreRequest.php`, including literal `Assert\Range` limits
   (attribute arguments cannot call functions).
4. If the engine has its own `maxPlausiblePoints`, keep it identical to the PHP one.
5. Update `backend/tests/Api/LeaderboardApiTest.php`: one submission exactly at the bound
   (accepted, 201) and one just above it (rejected, 422 with a violation on `points`).
6. A change to the submitted fields (`points`, `lines`, `level`) also touches
   `Score` (entity + new migration), `Leaderboard::record()`, `LeaderboardEntry`,
   `RecordedScore`, `ScoreRepository` and the types in `frontend/src/api/client.ts`.
7. Run the `verify` skill for both sides.

Scores already in the database stay. A tighter bound applies to new submissions only; mention it
in the commit message if old scores would no longer pass.
