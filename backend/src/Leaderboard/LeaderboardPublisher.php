<?php

declare(strict_types=1);

namespace App\Leaderboard;

use Psr\Log\LoggerInterface;
use Symfony\Component\Mercure\HubInterface;
use Symfony\Component\Mercure\Update;

/**
 * Pushes the full top list to every browser subscribed to the public "leaderboard" topic.
 */
final class LeaderboardPublisher
{
    public const string TOPIC = 'leaderboard';

    public function __construct(
        private readonly HubInterface $hub,
        private readonly LoggerInterface $logger,
    ) {
    }

    /** @param list<LeaderboardEntry> $entries */
    public function publish(array $entries): void
    {
        $update = new Update(self::TOPIC, json_encode(['leaderboard' => $entries], \JSON_THROW_ON_ERROR));

        try {
            $this->hub->publish($update);
        } catch (\Throwable $e) {
            // A dead hub must not fail score submission; subscribers reload on reconnect.
            $this->logger->error('Failed to publish leaderboard update to Mercure: {message}', [
                'message' => $e->getMessage(),
                'exception' => $e,
            ]);
        }
    }
}
