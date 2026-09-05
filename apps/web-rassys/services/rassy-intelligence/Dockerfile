FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/rassy-intelligence/package.json services/rassy-intelligence/tsconfig.json ./services/rassy-intelligence/
COPY packages/mr-rassy-core/package.json packages/mr-rassy-core/tsconfig.json /app/packages/mr-rassy-core/
COPY packages/mr-rassy-core/src /app/packages/mr-rassy-core/src
COPY services/rassy-intelligence/src /app/services/rassy-intelligence/src
RUN pnpm install --frozen-lockfile --filter rassy-intelligence... \
  && pnpm --filter @rassys/mr-rassy-core build \
  && pnpm --filter rassy-intelligence build \
  && pnpm deploy --legacy --filter rassy-intelligence --prod /out

FROM node:22-bookworm-slim
WORKDIR /app/services/rassy-intelligence
ENV NODE_ENV=production
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/dist ./dist
USER node
CMD ["node", "dist/index.js"]
