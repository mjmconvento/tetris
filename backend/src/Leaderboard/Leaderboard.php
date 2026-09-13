<?php

declare(strict_types=1);

namespace App\Leaderboard;

use App\Entity\Score;
use App\Entity\User;
use App\Repository\ScoreRepository;
use Doctrine\ORM\EntityManagerInterface;

final class Leaderboard
{
    public const int SIZE = 10;

    public function __construct(
        private readonly EntityManagerInterface $entityManager,
        private readonly ScoreRepository $scores,
        private readonly LeaderboardPublisher $publisher,
    ) {
    }

    /** @return list<LeaderboardEntry> */
    public function top(): array
    {
        return $this->scores->findTop(self::SIZE);
    }

    /** Persists a finished game and broadcasts the top list when the game lands on it. */
    public function record(User $user, int $points, int $lines, int $level): RecordedScore
    {
        $score = new Score($user, $points, $lines, $level);
        $this->entityManager->persist($score);
        $this->entityManager->flush();

        $top = $this->top();
        $rank = null;
        foreach ($top as $entry) {
            if ($entry->scoreId === $score->getId()) {
                $rank = $entry->rank;
                break;
            }
        }

        if (null !== $rank) {
            $this->publisher->publish($top);
        }

        return new RecordedScore($score, $rank);
    }
}
