<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\ScoreRepository;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: ScoreRepository::class)]
#[ORM\Table(name: 'scores')]
#[ORM\Index(name: 'scores_user_points_idx', columns: ['user_id', 'points'])]
#[ORM\Index(name: 'scores_points_idx', columns: ['points'])]
class Score
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private User $user;

    #[ORM\Column]
    private int $points;

    #[ORM\Column]
    private int $lines;

    #[ORM\Column]
    private int $level;

    #[ORM\Column(type: Types::DATETIMETZ_IMMUTABLE)]
    private \DateTimeImmutable $achievedAt;

    public function __construct(User $user, int $points, int $lines, int $level)
    {
        $this->user = $user;
        $this->points = $points;
        $this->lines = $lines;
        $this->level = $level;
        $this->achievedAt = new \DateTimeImmutable();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getUser(): User
    {
        return $this->user;
    }

    public function getPoints(): int
    {
        return $this->points;
    }

    public function getLines(): int
    {
        return $this->lines;
    }

    public function getLevel(): int
    {
        return $this->level;
    }

    public function getAchievedAt(): \DateTimeImmutable
    {
        return $this->achievedAt;
    }
}
