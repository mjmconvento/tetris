<?php

declare(strict_types=1);

namespace App\Security;

use App\Http\ApiProblem;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Security\Core\Exception\AuthenticationException;
use Symfony\Component\Security\Core\Exception\TooManyLoginAttemptsAuthenticationException;
use Symfony\Component\Security\Http\Authentication\AuthenticationFailureHandlerInterface;
use Symfony\Component\Security\Http\EntryPoint\AuthenticationEntryPointInterface;

/**
 * Turns "not logged in" and "login failed" into problem+json instead of redirects/HTML.
 */
final class JsonAuthenticationResponder implements AuthenticationEntryPointInterface, AuthenticationFailureHandlerInterface
{
    public function start(Request $request, ?AuthenticationException $authException = null): Response
    {
        return ApiProblem::response(Response::HTTP_UNAUTHORIZED, 'Authentication required.');
    }

    public function onAuthenticationFailure(Request $request, AuthenticationException $exception): Response
    {
        if ($exception instanceof TooManyLoginAttemptsAuthenticationException) {
            return ApiProblem::response(
                Response::HTTP_TOO_MANY_REQUESTS,
                strtr($exception->getMessageKey(), $exception->getMessageData()),
            );
        }

        return ApiProblem::response(Response::HTTP_UNAUTHORIZED, 'Invalid username or password.');
    }
}
