<?php

declare(strict_types=1);

namespace App\Leaderboard;

final readonly class LeaderboardEntry implements \JsonSerializable
{
    public function __construct(
        public int $rank,
        public int $scoreId,
        public string $username,
        public int $points,
        public int $lines,
        public int $level,
        public \DateTimeImmutable $achievedAt,
    ) {
    }

    /** @return array<string, int|string> */
    public function jsonSerialize(): array
    {
        return [
            'id' => $this->scoreId,
            'rank' => $this->rank,
            'username' => $this->username,
            'points' => $this->points,
            'lines' => $this->lines,
            'level' => $this->level,
            'achievedAt' => $this->achievedAt->format(\DateTimeInterface::ATOM),
        ];
    }
}
