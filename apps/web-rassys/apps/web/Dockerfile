FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --frozen-lockfile --filter web...

FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN corepack enable
ARG NEXT_PUBLIC_STREAM_URL
ARG NEXT_PUBLIC_STREAM_LOSSLESS_URL
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_MUSIC_LIBRARY_URL
ARG NEXT_PUBLIC_MINECRAFT_MAP_URL
ARG NEXT_PUBLIC_MINECRAFT_SERVER_ADDRESS
ARG NEXT_PUBLIC_RADIO_API_URL
ARG NEXT_PUBLIC_MINECRAFT_API_URL
ARG NEXT_PUBLIC_UMAMI_SCRIPT_URL="https://umami.rasies.com/script.js"
ARG NEXT_PUBLIC_UMAMI_WEBSITE_ID=""
ARG NEXT_PUBLIC_UMAMI_DOMAINS=""
ARG DATABASE_URL
ENV NEXT_PUBLIC_STREAM_URL=${NEXT_PUBLIC_STREAM_URL}
ENV NEXT_PUBLIC_STREAM_LOSSLESS_URL=${NEXT_PUBLIC_STREAM_LOSSLESS_URL}
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
ENV NEXT_PUBLIC_MUSIC_LIBRARY_URL=${NEXT_PUBLIC_MUSIC_LIBRARY_URL}
ENV NEXT_PUBLIC_MINECRAFT_MAP_URL=${NEXT_PUBLIC_MINECRAFT_MAP_URL}
ENV NEXT_PUBLIC_MINECRAFT_SERVER_ADDRESS=${NEXT_PUBLIC_MINECRAFT_SERVER_ADDRESS}
ENV NEXT_PUBLIC_RADIO_API_URL=${NEXT_PUBLIC_RADIO_API_URL}
ENV NEXT_PUBLIC_MINECRAFT_API_URL=${NEXT_PUBLIC_MINECRAFT_API_URL}
ENV NEXT_PUBLIC_UMAMI_SCRIPT_URL=${NEXT_PUBLIC_UMAMI_SCRIPT_URL}
ENV NEXT_PUBLIC_UMAMI_WEBSITE_ID=${NEXT_PUBLIC_UMAMI_WEBSITE_ID}
ENV NEXT_PUBLIC_UMAMI_DOMAINS=${NEXT_PUBLIC_UMAMI_DOMAINS}
ENV DATABASE_URL=${DATABASE_URL}
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY apps/web/ ./apps/web/
RUN mkdir -p apps/web/public && pnpm --dir apps/web build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
RUN apt-get update \
  && apt-get install -y --no-install-recommends wget \
  && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/apps/web/.next-usr-a/standalone ./
COPY --from=builder /app/apps/web/.next-usr-a/static ./.next-usr-a/static
COPY --from=builder /app/apps/web/.next-usr-a/static ./.next/static
COPY --from=builder /app/apps/web/.next-usr-a/static ./apps/web/.next-usr-a/static
COPY --from=builder /app/apps/web/.next-usr-a/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
