<?php

declare(strict_types=1);

namespace App\Leaderboard;

use App\Entity\Score;

final readonly class RecordedScore implements \JsonSerializable
{
    public function __construct(
        public Score $score,
        /** Position on the public top list, or null if the game did not make it. */
        public ?int $rank,
    ) {
    }

    /** @return array<string, int|string|null> */
    public function jsonSerialize(): array
    {
        return [
            'id' => $this->score->getId(),
            'points' => $this->score->getPoints(),
            'lines' => $this->score->getLines(),
            'level' => $this->score->getLevel(),
            'achievedAt' => $this->score->getAchievedAt()->format(\DateTimeInterface::ATOM),
            'rank' => $this->rank,
        ];
    }
}
