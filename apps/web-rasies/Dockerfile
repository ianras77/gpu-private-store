# ---------- build web ----------
FROM node:20-alpine AS webbuild
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ---------- build server ----------
FROM node:20-alpine AS serverbuild
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/ ./
RUN npm run build && npm prune --omit=dev

# ---------- runtime ----------
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup -S app && adduser -S app -G app

# Copy compiled server
COPY --from=serverbuild --chown=app:app /app/server/dist ./server/dist
COPY --from=serverbuild --chown=app:app /app/server/package.json ./server/package.json
COPY --from=serverbuild --chown=app:app /app/server/node_modules ./server/node_modules

# Copy built web dist
COPY --from=webbuild --chown=app:app /app/web/dist ./web/dist

EXPOSE 3000
USER app
CMD ["node", "server/dist/index.js"]
