#syntax=docker/dockerfile:1

# Symfony on FrankenPHP (Caddy + PHP 8.4 + built-in Mercure hub).
# Targets: "dev" (bind-mounted sources, php.ini-development) and "prod" (baked image).

FROM dunglas/frankenphp:1-php8.4 AS base

WORKDIR /app

VOLUME /app/var/

RUN apt-get update && apt-get install -y --no-install-recommends \
        git \
        unzip \
    && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    install-php-extensions \
        @composer \
        apcu \
        intl \
        opcache \
        pdo_pgsql \
        zip \
    ;

# The upstream image stamps cap_net_bind_service=ep onto the binary. Sandboxed PaaS runtimes
# (Render, Cloud Run, ...) drop that capability from the container's bounding set, and the
# kernel then refuses to exec a binary whose file capabilities it cannot grant:
# "exec: frankenphp: Operation not permitted". We never need it: root binds :80 locally and
# the hosted service listens on an unprivileged port.
RUN setcap -r /usr/local/bin/frankenphp

ENV COMPOSER_ALLOW_SUPERUSER=1
ENV PHP_INI_SCAN_DIR=":$PHP_INI_DIR/app.conf.d"

COPY --link frankenphp/conf.d/10-app.ini $PHP_INI_DIR/app.conf.d/
COPY --link --chmod=755 frankenphp/docker-entrypoint.sh /usr/local/bin/docker-entrypoint
COPY --link frankenphp/Caddyfile /etc/frankenphp/Caddyfile

ENTRYPOINT ["docker-entrypoint"]

HEALTHCHECK --start-period=60s CMD curl -f http://localhost:2019/metrics || exit 1
CMD ["frankenphp", "run", "--config", "/etc/frankenphp/Caddyfile"]


FROM base AS dev

ENV APP_ENV=dev

RUN mv "$PHP_INI_DIR/php.ini-development" "$PHP_INI_DIR/php.ini"

COPY --link frankenphp/conf.d/20-app.dev.ini $PHP_INI_DIR/app.conf.d/

# Sources are bind-mounted by compose.override.yaml; vendor/ is installed by the entrypoint.
CMD ["frankenphp", "run", "--config", "/etc/frankenphp/Caddyfile", "--watch"]


FROM base AS prod

ENV APP_ENV=prod

RUN mv "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini"

COPY --link frankenphp/conf.d/20-app.prod.ini $PHP_INI_DIR/app.conf.d/

# Install dependencies before copying sources so this layer is cached across code changes.
COPY --link composer.* symfony.* ./
RUN set -eux; \
    composer install --no-cache --prefer-dist --no-dev --no-autoloader --no-scripts --no-progress

COPY --link . ./
RUN rm -rf frankenphp/

RUN set -eux; \
    mkdir -p var/cache var/log; \
    composer dump-autoload --classmap-authoritative --no-dev; \
    composer dump-env prod; \
    composer run-script --no-dev post-install-cmd; \
    chmod +x bin/console; \
    sync;
