# syntax=docker/dockerfile:1.7
FROM node:20

WORKDIR /app
RUN corepack enable

# Copy only workspace manifests first for better cache reuse.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/ios/package.json apps/ios/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --frozen-lockfile

COPY . .

ARG NEXT_PUBLIC_API_URL=http://localhost:3191
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN pnpm -C packages/shared build \
 && pnpm -C apps/api exec prisma generate \
 && pnpm -C apps/web build

ENV NODE_ENV=production
EXPOSE 3190 3191

CMD ["sh", "-lc", "tail -f /dev/null"]
