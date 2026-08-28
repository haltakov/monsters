FROM node:24-alpine AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# The static export inlines the API origin at build time.
ARG NEXT_PUBLIC_API_URL="https://monsters-api.haltakov.com"
ENV NEXT_PUBLIC_API_URL="$NEXT_PUBLIC_API_URL"

RUN corepack enable && corepack prepare pnpm@11.18.0 --activate

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/game-core/package.json packages/game-core/package.json

RUN pnpm install --frozen-lockfile --filter @monsters/web...

COPY packages/game-core packages/game-core
COPY apps/web apps/web

RUN pnpm --filter @monsters/game-core build \
  && pnpm --filter @monsters/web build

FROM nginx:1.29-alpine AS runner

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /workspace/apps/web/out /usr/share/nginx/html

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
