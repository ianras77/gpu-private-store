FROM node:18-alpine AS deps
WORKDIR /app
COPY services/cheshire-proxy/package.json services/cheshire-proxy/package-lock.json* ./
RUN npm install --no-audit --no-fund

FROM node:18-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY services/cheshire-proxy/ ./
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=deps /app/node_modules ./node_modules
EXPOSE 1865
CMD ["node", "/app/dist/index.js"]
