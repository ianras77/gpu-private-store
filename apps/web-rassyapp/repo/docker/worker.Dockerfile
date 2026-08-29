FROM node:20-bookworm-slim
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# The worker is TypeScript today; keep the pinned tsx runtime available until
# the worker is emitted as a standalone JavaScript bundle.
RUN npm ci --legacy-peer-deps
COPY . .
RUN npx prisma generate
ENV NODE_ENV=production
CMD ["node", "--import", "tsx", "services/agent-worker/index.ts"]
