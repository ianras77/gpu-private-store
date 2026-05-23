FROM node:20-bookworm-slim AS base
WORKDIR /app

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS builder

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY . .
RUN mkdir -p public
RUN npm run prisma:generate
RUN CAT_HTTP_BASE=http://cheshire-cat-core:80 \
  CAT_WS_BASE=ws://cheshire-cat-core:80 \
  APP_SESSION_SECRET=build-time-secret \
  NEXT_DISABLE_ESLINT=1 npm run build

FROM base AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.js ./next.config.js
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/docker ./docker

EXPOSE 3000

ENTRYPOINT ["./docker/entrypoint.sh"]
