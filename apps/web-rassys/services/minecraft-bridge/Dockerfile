FROM node:18-alpine AS deps
WORKDIR /app
COPY services/minecraft-bridge/package.json services/minecraft-bridge/package-lock.json* ./
RUN npm install --no-audit --no-fund

FROM node:18-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY services/minecraft-bridge/ ./
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=deps /app/node_modules ./node_modules
EXPOSE 4100
CMD ["node", "/app/dist/index.js"]
