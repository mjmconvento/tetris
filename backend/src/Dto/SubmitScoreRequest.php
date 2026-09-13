<?php

declare(strict_types=1);

namespace App\Dto;

use Symfony\Component\Validator\Constraints as Assert;
use Symfony\Component\Validator\Context\ExecutionContextInterface;

/**
 * A finished game as reported by the client.
 *
 * The game runs in the browser, so these numbers cannot be trusted; the checks below
 * only reject values that are impossible under the game's own rules (see frontend
 * src/game/engine.ts): level is derived from lines, and points are bounded by the
 * highest-paying clear (a Tetris: 200 points per line per level) plus drop bonuses.
 */
final readonly class SubmitScoreRequest
{
    private const int LINES_PER_LEVEL = 10;
    private const int MAX_POINTS_PER_LINE_PER_LEVEL = 200;
    /** Hard-dropping a piece the full height of the board is worth ~44 points. */
    private const int MAX_DROP_POINTS_PER_PIECE = 50;

    public function __construct(
        #[Assert\Range(min: 0, max: 2_000_000_000)]
        public int $points,
        #[Assert\Range(min: 0, max: 100_000)]
        public int $lines,
        #[Assert\Range(min: 1, max: 10_001)]
        public int $level,
    ) {
    }

    #[Assert\Callback]
    public function validatePlausibility(ExecutionContextInterface $context): void
    {
        if ($this->level !== 1 + intdiv($this->lines, self::LINES_PER_LEVEL)) {
            $context->buildViolation('Level does not match the number of lines cleared.')
                ->atPath('level')
                ->addViolation();

            return;
        }

        if ($this->points > self::maxPlausiblePoints($this->lines, $this->level)) {
            $context->buildViolation('Score is not achievable with this many lines.')
                ->atPath('points')
                ->addViolation();
        }
    }

    public static function maxPlausiblePoints(int $lines, int $level): int
    {
        // Each piece fills 4 cells; cleared cells (10 per line) plus a full board (200 cells)
        // bound the number of pieces that can have been placed.
        $maxPieces = intdiv(10 * $lines + 200, 4);

        return self::MAX_POINTS_PER_LINE_PER_LEVEL * $lines * $level
            + self::MAX_DROP_POINTS_PER_PIECE * $maxPieces;
    }
}
