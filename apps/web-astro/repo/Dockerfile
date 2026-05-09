# syntax=docker/dockerfile:1.7
FROM node:20-alpine
WORKDIR /app

COPY . .
RUN   if [ -f pnpm-lock.yaml ]; then corepack enable && pnpm i --frozen-lockfile;   elif [ -f package-lock.json ]; then npm ci --include=dev;   elif [ -f yarn.lock ]; then corepack enable && yarn install --frozen-lockfile;   else npm install;   fi

RUN   if npm run | grep -q " build"; then npm run build;   elif command -v pnpm >/dev/null && pnpm run | grep -q " build"; then pnpm build;   elif command -v yarn >/dev/null && yarn run | grep -q " build"; then yarn build;   else echo "No build script. Skipping build.";   fi

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3   CMD wget -qO- http://127.0.0.1:${PORT}/healthz || exit 1
CMD ["sh", "-lc", "if npm run | grep -q ' start'; then npm run start; else tail -f /dev/null; fi"]
