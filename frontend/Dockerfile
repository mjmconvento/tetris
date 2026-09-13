#syntax=docker/dockerfile:1

# Targets: "dev" (Vite dev server, sources bind-mounted by compose.override.yaml)
# and "prod" (static build served by nginx, which also proxies /api and Mercure).

FROM node:24-alpine AS base
WORKDIR /app


FROM base AS dev
ENV NODE_ENV=development
COPY package.json package-lock.json ./
RUN npm ci --no-fund --no-audit
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "80"]


FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci --no-fund --no-audit
COPY . .
RUN npm run build


FROM nginx:1-alpine AS prod
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
