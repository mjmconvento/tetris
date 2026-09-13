<?php

declare(strict_types=1);

namespace App\Controller;

use App\Dto\RegisterRequest;
use App\Entity\User;
use App\Http\ApiProblem;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Symfony\Component\RateLimiter\RateLimiterFactoryInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

#[Route('/api/auth', format: 'json')]
final class AuthController
{
    #[Route('/register', name: 'api_auth_register', methods: ['POST'])]
    public function register(
        Request $request,
        #[MapRequestPayload] RegisterRequest $payload,
        UserPasswordHasherInterface $passwordHasher,
        EntityManagerInterface $entityManager,
        Security $security,
        RateLimiterFactoryInterface $registerLimiter,
    ): JsonResponse {
        $limit = $registerLimiter->create($request->getClientIp())->consume();
        if (!$limit->isAccepted()) {
            return ApiProblem::response(
                Response::HTTP_TOO_MANY_REQUESTS,
                'Too many accounts created from this address; try again later.',
                ['Retry-After' => (string) max(1, $limit->getRetryAfter()->getTimestamp() - time())],
            );
        }

        $user = new User($payload->username);
        $user->setPassword($passwordHasher->hashPassword($user, $payload->password));
        $entityManager->persist($user);

        try {
            $entityManager->flush();
        } catch (UniqueConstraintViolationException) {
            return ApiProblem::response(Response::HTTP_CONFLICT, 'That username is already taken.');
        }

        $security->login($user, 'json_login', 'main');

        return new JsonResponse(self::userPayload($user), Response::HTTP_CREATED);
    }

    /**
     * The json_login authenticator handles the credentials; this body only runs after
     * a successful login (or for malformed requests it did not pick up).
     */
    #[Route('/login', name: 'api_auth_login', methods: ['POST'])]
    public function login(#[CurrentUser] ?User $user): JsonResponse
    {
        if (null === $user) {
            return ApiProblem::response(Response::HTTP_BAD_REQUEST, 'Expected a JSON body with "username" and "password".');
        }

        return new JsonResponse(self::userPayload($user));
    }

    /** Intercepted by the firewall's logout listener; never executed. */
    #[Route('/logout', name: 'api_auth_logout', methods: ['POST'])]
    public function logout(): never
    {
        throw new \LogicException('Logout is handled by the security firewall.');
    }

    #[Route('/me', name: 'api_auth_me', methods: ['GET'])]
    public function me(#[CurrentUser] User $user): JsonResponse
    {
        return new JsonResponse(self::userPayload($user));
    }

    /** @return array{id: int, username: string} */
    private static function userPayload(User $user): array
    {
        return ['id' => $user->getId(), 'username' => $user->getUsername()];
    }
}
