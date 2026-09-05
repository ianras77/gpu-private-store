FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/radio-controller/package.json services/radio-controller/tsconfig.json ./services/radio-controller/
COPY services/radio-controller/prisma ./services/radio-controller/prisma
RUN pnpm install --frozen-lockfile --filter radio-controller...

FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/services/radio-controller/node_modules ./services/radio-controller/node_modules
COPY --from=deps /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY services/radio-controller/ ./services/radio-controller/
RUN pnpm --dir services/radio-controller prisma:generate && pnpm --dir services/radio-controller build \
  && pnpm deploy --legacy --filter radio-controller --prod /out

FROM node:22-bookworm-slim AS runner
WORKDIR /app/services/radio-controller
ENV NODE_ENV=production
RUN apt-get update \
  && apt-get install -y --no-install-recommends wget ffmpeg libheif-examples openssl \
  && rm -rf /var/lib/apt/lists/*
COPY --from=builder /out/dist ./dist
COPY --from=builder /out/prisma ./prisma
COPY --from=builder /out/package.json ./package.json
COPY --from=builder /out/node_modules ./node_modules
COPY services/radio-controller/docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 4000
ENTRYPOINT ["/entrypoint.sh"]
