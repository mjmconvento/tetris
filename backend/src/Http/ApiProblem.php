<?php

declare(strict_types=1);

namespace App\Http;

use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;

/**
 * RFC 9457 problem responses, matching the shape Symfony's error renderer emits for
 * exceptions (type/title/status/detail) so the frontend handles one format.
 */
final class ApiProblem
{
    /** @param array<string, string> $headers */
    public static function response(int $status, string $detail, array $headers = []): JsonResponse
    {
        return new JsonResponse(
            [
                'type' => 'about:blank',
                'title' => Response::$statusTexts[$status] ?? 'Error',
                'status' => $status,
                'detail' => $detail,
            ],
            $status,
            ['Content-Type' => 'application/problem+json'] + $headers,
        );
    }
}
