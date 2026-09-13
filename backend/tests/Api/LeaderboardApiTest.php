<?php

declare(strict_types=1);

namespace App\Tests\Api;

use App\Leaderboard\Leaderboard;
use App\Tests\Double\RecordingHub;
use Doctrine\DBAL\Connection;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Mercure\HubInterface;

final class LeaderboardApiTest extends WebTestCase
{
    private KernelBrowser $client;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        static::getContainer()->get(Connection::class)
            ->executeStatement('TRUNCATE TABLE scores, users RESTART IDENTITY CASCADE');
    }

    public function testSignUpPlaySignOutAndSignBackInWithDifferentCase(): void
    {
        $this->client->jsonRequest('POST', '/api/auth/register', ['username' => 'Alice', 'password' => 'correct horse']);
        self::assertResponseStatusCodeSame(Response::HTTP_CREATED);
        self::assertSame('Alice', $this->json()['username']);

        $this->client->jsonRequest('GET', '/api/auth/me');
        self::assertResponseIsSuccessful();
        self::assertSame('Alice', $this->json()['username']);

        $this->client->jsonRequest('POST', '/api/scores', ['points' => 1300, 'lines' => 10, 'level' => 2]);
        self::assertResponseStatusCodeSame(Response::HTTP_CREATED);
        self::assertSame(1, $this->json()['rank']);

        $this->client->jsonRequest('GET', '/api/scores/me');
        self::assertSame(['best' => 1300, 'games' => 1], $this->json());

        $this->client->jsonRequest('POST', '/api/auth/logout');
        self::assertResponseStatusCodeSame(Response::HTTP_NO_CONTENT);

        $this->client->jsonRequest('GET', '/api/auth/me');
        self::assertResponseStatusCodeSame(Response::HTTP_UNAUTHORIZED);
        self::assertResponseHeaderSame('Content-Type', 'application/problem+json');

        $this->client->jsonRequest('POST', '/api/auth/login', ['username' => 'ALICE', 'password' => 'wrong password']);
        self::assertResponseStatusCodeSame(Response::HTTP_UNAUTHORIZED);

        $this->client->jsonRequest('POST', '/api/auth/login', ['username' => 'ALICE', 'password' => 'correct horse']);
        self::assertResponseIsSuccessful();
        self::assertSame('Alice', $this->json()['username']);
    }

    public function testUsernamesAreUniqueIgnoringCase(): void
    {
        $this->client->jsonRequest('POST', '/api/auth/register', ['username' => 'Bob', 'password' => 'correct horse']);
        self::assertResponseStatusCodeSame(Response::HTTP_CREATED);

        $this->client->jsonRequest('POST', '/api/auth/register', ['username' => 'bob', 'password' => 'another password']);
        self::assertResponseStatusCodeSame(Response::HTTP_CONFLICT);
    }

    public function testLeaderboardRanksGamesNotPlayersAndPublishesOnlyWhenItChanges(): void
    {
        // The browser reboots the kernel per request by default, which would hand out a new hub each time.
        $this->client->disableReboot();
        $hub = static::getContainer()->get(HubInterface::class);
        self::assertInstanceOf(RecordingHub::class, $hub);

        $this->register('alice');
        $this->submit(500, 2, 1, expectedRank: 1);
        $this->submit(300, 1, 1, expectedRank: 2); // a weaker game by the same player still takes a place
        self::assertCount(2, $hub->updates);

        $this->register('bob');
        $this->submit(400, 2, 1, expectedRank: 2);
        self::assertCount(3, $hub->updates);

        $this->client->jsonRequest('POST', '/api/auth/logout');
        $this->client->jsonRequest('GET', '/api/scores/top');
        self::assertResponseIsSuccessful();

        $board = $this->json()['leaderboard'];
        self::assertSame(['alice', 'bob', 'alice'], array_column($board, 'username'));
        self::assertSame([500, 400, 300], array_column($board, 'points'));
        self::assertSame([1, 2, 3], array_column($board, 'rank'));
        self::assertCount(3, array_unique(array_column($board, 'id')));

        $pushed = json_decode($hub->updates[2]->getData(), true, flags: \JSON_THROW_ON_ERROR);
        self::assertSame($board, $pushed['leaderboard']);
        self::assertSame(['leaderboard'], $hub->updates[2]->getTopics());
    }

    public function testGamesBelowTheTopTenAreSavedButNeitherRankedNorPublished(): void
    {
        $this->client->disableReboot();
        $hub = static::getContainer()->get(HubInterface::class);
        self::assertInstanceOf(RecordingHub::class, $hub);

        $this->register('dave');
        for ($i = 1; $i <= Leaderboard::SIZE; $i++) {
            $this->submit(100 * $i, 1, 1, expectedRank: 1); // each game beats the previous ones
        }
        self::assertCount(Leaderboard::SIZE, $hub->updates);

        $this->submit(50, 0, 1, expectedRank: null);
        self::assertCount(Leaderboard::SIZE, $hub->updates);

        $this->client->jsonRequest('GET', '/api/scores/me');
        self::assertSame(['best' => 1000, 'games' => Leaderboard::SIZE + 1], $this->json());

        $this->client->jsonRequest('GET', '/api/scores/top');
        self::assertCount(Leaderboard::SIZE, $this->json()['leaderboard']);
        self::assertSame(100, $this->json()['leaderboard'][Leaderboard::SIZE - 1]['points']);
    }

    public function testRejectsScoresTheGameCannotProduce(): void
    {
        $this->register('carol');

        $this->client->jsonRequest('POST', '/api/scores', ['points' => 1_000_000, 'lines' => 1, 'level' => 1]);
        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
        self::assertSame('points', $this->json()['violations'][0]['propertyPath']);

        $this->client->jsonRequest('POST', '/api/scores', ['points' => 100, 'lines' => 25, 'level' => 1]);
        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
        self::assertSame('level', $this->json()['violations'][0]['propertyPath']);

        $this->client->jsonRequest('GET', '/api/scores/me');
        self::assertSame(['best' => null, 'games' => 0], $this->json());
    }

    public function testAnonymousPlayersCannotSubmitScores(): void
    {
        $this->client->jsonRequest('POST', '/api/scores', ['points' => 100, 'lines' => 1, 'level' => 1]);
        self::assertResponseStatusCodeSame(Response::HTTP_UNAUTHORIZED);
        self::assertSame('Authentication required.', $this->json()['detail']);
    }

    private function register(string $username): void
    {
        $this->client->jsonRequest('POST', '/api/auth/register', ['username' => $username, 'password' => 'correct horse']);
        self::assertResponseStatusCodeSame(Response::HTTP_CREATED);
    }

    private function submit(int $points, int $lines, int $level, ?int $expectedRank): void
    {
        $this->client->jsonRequest('POST', '/api/scores', ['points' => $points, 'lines' => $lines, 'level' => $level]);
        self::assertResponseStatusCodeSame(Response::HTTP_CREATED);
        self::assertSame($expectedRank, $this->json()['rank']);
    }

    /** @return array<string, mixed> */
    private function json(): array
    {
        return json_decode((string) $this->client->getResponse()->getContent(), true, flags: \JSON_THROW_ON_ERROR);
    }
}
