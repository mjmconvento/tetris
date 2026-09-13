<?php

declare(strict_types=1);

namespace App\Security;

use Symfony\Component\EventDispatcher\Attribute\AsEventListener;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Security\Http\Event\LogoutEvent;

/**
 * Runs before Symfony's DefaultLogoutListener (priority 64) so logout answers 204
 * instead of redirecting to "/".
 */
#[AsEventListener(priority: 100)]
final class LogoutResponseListener
{
    public function __invoke(LogoutEvent $event): void
    {
        $event->setResponse(new Response(null, Response::HTTP_NO_CONTENT));
    }
}
