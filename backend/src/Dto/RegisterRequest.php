<?php

declare(strict_types=1);

namespace App\Dto;

use Symfony\Component\Validator\Constraints as Assert;

final readonly class RegisterRequest
{
    public function __construct(
        #[Assert\NotBlank]
        #[Assert\Length(min: 3, max: 20)]
        #[Assert\Regex(pattern: '/^[A-Za-z0-9_]+$/', message: 'Only letters, digits and underscores are allowed.')]
        public string $username,
        #[Assert\NotBlank]
        #[Assert\Length(min: 8, max: 4096)]
        public string $password,
    ) {
    }
}
