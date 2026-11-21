#!/usr/bin/env python3
"""PostToolUse: lint the file just written and surface the cross-file rules it touches."""

from __future__ import annotations

import re

from _common import ROOT, clip, has, project_path, read_event, respond, run, running_services

# Files whose constants decide what a game can score. The backend re-derives the same
# bounds to reject impossible submissions, so the two sides must change together.
SCORE_FILES = (
    "frontend/src/game/engine.ts",
    "backend/src/Dto/SubmitScoreRequest.php",
)

# The rules engine: runs headless under Vitest and must replay identically from a seed.
PURE_FILES = (
    "frontend/src/game/engine.ts",
    "frontend/src/game/rng.ts",
    "frontend/src/game/tetrominoes.ts",
)

API_SHAPE_FILES = (
    "frontend/src/api/client.ts",
    "backend/src/Leaderboard/LeaderboardEntry.php",
    "backend/src/Leaderboard/RecordedScore.php",
    "backend/src/Controller/AuthController.php",
    "backend/src/Controller/ScoreController.php",
)

IMPURE = [
    (re.compile(r"\bMath\.random\s*\("), "Math.random(): draw from the seeded RNG in rng.ts"),
    (re.compile(r"\bperformance\.now\s*\("), "performance.now(): elapsed time arrives as the dtMs argument"),
    (re.compile(r"\b(window|document|navigator|localStorage|sessionStorage)\."), "a browser global: the engine runs headless"),
    (re.compile(r"\b(setTimeout|setInterval|requestAnimationFrame)\s*\("), "a timer: the frame loop belongs in useTetris.ts"),
    (re.compile(r"\bfetch\s*\("), "network access"),
    (re.compile(r"from\s+['\"]react(-dom)?['\"]"), "a React import"),
]
DEFAULT_SEED = re.compile(r"seed:\s*number\s*=\s*Date\.now\(\)")


def impurities(rel: str) -> list[str]:
    found = []
    for number, line in enumerate((ROOT / rel).read_text(encoding="utf-8").splitlines(), 1):
        code = line.split("//", 1)[0]
        if code.lstrip().startswith("*"):
            continue
        for pattern, why in IMPURE:
            if pattern.search(code):
                found.append(f"  line {number}: {why}")
        if "Date.now(" in code and not DEFAULT_SEED.search(code):
            found.append(f"  line {number}: Date.now(): only createGame's default seed may read the clock")
    return found


def lint(rel: str) -> str | None:
    if rel.startswith("frontend/") and rel.endswith((".ts", ".tsx")):
        oxlint = ROOT / "frontend/node_modules/.bin/oxlint"
        if oxlint.exists():
            code, out = run([str(oxlint), rel.removeprefix("frontend/")], cwd=ROOT / "frontend")
            if code not in (0, 127):
                return f"oxlint reported problems in {rel}:\n{clip(out)}"
    if rel.startswith("backend/") and rel.endswith(".php"):
        if has("php"):
            code, out = run(["php", "-l", rel])
        elif "backend" in (running_services() or []):
            code, out = run(["docker", "compose", "exec", "-T", "backend", "php", "-l", rel.removeprefix("backend/")])
        else:
            return None
        if code not in (0, 127):
            return f"PHP syntax error in {rel}:\n{clip(out)}"
    return None


def main() -> None:
    rel = project_path(read_event())
    if rel is None or not (ROOT / rel).is_file():
        return
    notes: list[str] = []
    problems: list[str] = []

    if rel in SCORE_FILES:
        notes.append(
            f"{rel} is one half of the scoring rules. The client pays points in frontend/src/game/engine.ts; "
            "backend/src/Dto/SubmitScoreRequest.php mirrors the same constants to reject impossible submissions. "
            "A rule change needs both sides plus frontend/src/game/engine.test.ts and backend/tests/Api/LeaderboardApiTest.php "
            "(checklist: the change-scoring-rules skill)."
        )
    if rel in PURE_FILES:
        found = impurities(rel)
        if found:
            problems.append(
                f"{rel} is part of the deterministic rules engine; it must not depend on the outside world:\n" + "\n".join(found)
            )
    if rel in API_SHAPE_FILES:
        notes.append(
            "The API's JSON shapes are mirrored by hand in frontend/src/api/client.ts (User, LeaderboardEntry, "
            "ScoreSummary, RecordedScore); there is no code generation, so a field change on one side needs the other."
        )
    if rel.startswith("backend/src/Entity/"):
        notes.append(
            "Doctrine mapping changed. The schema only changes through a migration: "
            "`docker compose exec backend php bin/console make:migration`, review the SQL, then `doctrine:migrations:migrate` "
            "(and `--env=test` for the test database). Render applies pending migrations when the container boots."
        )
    if rel == "backend/config/packages/security.yaml":
        notes.append("access_control applies only the first matching rule; a new /api path needs its own rule above any broader one.")

    problem = lint(rel)
    if problem:
        problems.append(problem)
    respond("PostToolUse", notes, problems)


if __name__ == "__main__":
    main()
