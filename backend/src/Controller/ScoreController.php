<?php

declare(strict_types=1);

namespace App\Controller;

use App\Dto\SubmitScoreRequest;
use App\Entity\User;
use App\Http\ApiProblem;
use App\Leaderboard\Leaderboard;
use App\Repository\ScoreRepository;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Component\RateLimiter\RateLimiterFactoryInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

#[Route('/api/scores', format: 'json')]
final class ScoreController
{
    #[Route('/top', name: 'api_scores_top', methods: ['GET'])]
    public function top(Leaderboard $leaderboard): JsonResponse
    {
        return new JsonResponse(['leaderboard' => $leaderboard->top()]);
    }

    #[Route('/me', name: 'api_scores_me', methods: ['GET'])]
    public function me(#[CurrentUser] User $user, ScoreRepository $scores): JsonResponse
    {
        return new JsonResponse($scores->summarizeForUser($user));
    }

    #[Route('', name: 'api_scores_submit', methods: ['POST'])]
    public function submit(
        #[CurrentUser] User $user,
        #[MapRequestPayload] SubmitScoreRequest $payload,
        Leaderboard $leaderboard,
        RateLimiterFactoryInterface $scoreSubmitLimiter,
    ): JsonResponse {
        $limit = $scoreSubmitLimiter->create((string) $user->getId())->consume();
        if (!$limit->isAccepted()) {
            return ApiProblem::response(
                Response::HTTP_TOO_MANY_REQUESTS,
                'Too many games submitted; slow down.',
                ['Retry-After' => (string) max(1, $limit->getRetryAfter()->getTimestamp() - time())],
            );
        }

        $recorded = $leaderboard->record($user, $payload->points, $payload->lines, $payload->level);

        return new JsonResponse($recorded, Response::HTTP_CREATED);
    }
}
