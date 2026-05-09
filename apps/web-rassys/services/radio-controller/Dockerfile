FROM node:18-bullseye-slim AS deps
WORKDIR /app/services/radio-controller
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY services/radio-controller/package.json services/radio-controller/package-lock.json* ./
RUN npm install --no-audit --no-fund

FROM node:18-bullseye-slim AS builder
WORKDIR /app/services/radio-controller
COPY --from=deps /app/services/radio-controller/node_modules ./node_modules
COPY services/radio-controller/ ./
RUN npm run prisma:generate
RUN npm run build

FROM node:18-bullseye-slim AS runner
WORKDIR /app/services/radio-controller
ENV NODE_ENV=production
RUN apt-get update \
  && apt-get install -y --no-install-recommends wget ffmpeg libheif-examples \
  && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/services/radio-controller/dist ./dist
COPY --from=builder /app/services/radio-controller/prisma ./prisma
COPY --from=builder /app/services/radio-controller/package.json ./package.json
COPY --from=builder /app/services/radio-controller/node_modules ./node_modules
COPY services/radio-controller/docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 4000
ENTRYPOINT ["/entrypoint.sh"]
