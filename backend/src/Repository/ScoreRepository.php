<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Score;
use App\Entity\User;
use App\Leaderboard\LeaderboardEntry;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\DBAL\ParameterType;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<Score>
 */
final class ScoreRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Score::class);
    }

    /**
     * Highest-scoring games, one row per game — a player can hold several places.
     * Ties resolve to the earlier game.
     *
     * @return list<LeaderboardEntry>
     */
    public function findTop(int $limit): array
    {
        $sql = <<<'SQL'
            SELECT s.id, s.points, s.lines, s.level, s.achieved_at, u.username
            FROM scores s
            JOIN users u ON u.id = s.user_id
            ORDER BY s.points DESC, s.id
            LIMIT :limit
            SQL;

        $rows = $this->getEntityManager()->getConnection()
            ->fetchAllAssociative($sql, ['limit' => $limit], ['limit' => ParameterType::INTEGER]);

        $entries = [];
        foreach ($rows as $i => $row) {
            $entries[] = new LeaderboardEntry(
                rank: $i + 1,
                scoreId: (int) $row['id'],
                username: $row['username'],
                points: (int) $row['points'],
                lines: (int) $row['lines'],
                level: (int) $row['level'],
                achievedAt: new \DateTimeImmutable($row['achieved_at']),
            );
        }

        return $entries;
    }

    /** @return array{best: int|null, games: int} */
    public function summarizeForUser(User $user): array
    {
        $row = $this->createQueryBuilder('s')
            ->select('MAX(s.points) AS best, COUNT(s.id) AS games')
            ->where('s.user = :user')
            ->setParameter('user', $user)
            ->getQuery()
            ->getSingleResult();

        return [
            'best' => null === $row['best'] ? null : (int) $row['best'],
            'games' => (int) $row['games'],
        ];
    }
}
