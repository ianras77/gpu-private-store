# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

FROM base AS deps
COPY package.json ./
COPY package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN   if [ -f package-lock.json ]; then npm ci;   elif [ -f pnpm-lock.yaml ]; then corepack enable && pnpm i --frozen-lockfile;   elif [ -f yarn.lock ]; then corepack enable && yarn install --frozen-lockfile;   else echo "No lockfile found. Please add one." && exit 1;   fi

FROM deps AS build
COPY . .
RUN   if npm run | grep -q " build"; then npm run build;   elif command -v pnpm >/dev/null && pnpm run | grep -q " build"; then pnpm build;   elif command -v yarn >/dev/null && yarn run | grep -q " build"; then yarn build;   else echo "No build script. Skipping build.";   fi

FROM base AS runner
RUN addgroup -S nodegrp && adduser -S nodeusr -G nodegrp
USER nodeusr
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app ./
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3   CMD wget -qO- http://127.0.0.1:${PORT}/healthz || exit 1
CMD ["sh", "-lc", "if npm run | grep -q ' start'; then npm run start; else node server.js; fi"]
