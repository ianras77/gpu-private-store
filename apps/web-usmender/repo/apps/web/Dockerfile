FROM node:20-bullseye-slim

WORKDIR /app

# Install base deps
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

# Keep workspace deps local to avoid hoisting issues
RUN npm install --workspaces --install-strategy=nested

COPY apps/web ./apps/web
COPY packages/shared ./packages/shared

# Make workspace-specific deps visible to root-level lint tooling
RUN mkdir -p node_modules && \
    ln -sf ../apps/web/node_modules/next node_modules/next && \
    ln -sf ../apps/web/node_modules/eslint-config-next node_modules/eslint-config-next

# Keep browser requests same-origin and proxy them to the API from the Next server.
ARG NEXT_PUBLIC_API_URL=/api
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ARG API_INTERNAL_URL=http://api:3001
ENV API_INTERNAL_URL=${API_INTERNAL_URL}
ARG NEXT_PUBLIC_UMAMI_SCRIPT_URL="https://umami.rasies.com/script.js"
ENV NEXT_PUBLIC_UMAMI_SCRIPT_URL=${NEXT_PUBLIC_UMAMI_SCRIPT_URL}
ARG NEXT_PUBLIC_UMAMI_WEBSITE_ID=""
ENV NEXT_PUBLIC_UMAMI_WEBSITE_ID=${NEXT_PUBLIC_UMAMI_WEBSITE_ID}
ARG NEXT_PUBLIC_UMAMI_DOMAINS=""
ENV NEXT_PUBLIC_UMAMI_DOMAINS=${NEXT_PUBLIC_UMAMI_DOMAINS}
# Skip Next's lockfile patching noise inside containers
ENV NEXT_IGNORE_INCORRECT_LOCKFILE=1

RUN npm --workspace apps/web run build

EXPOSE 3000

CMD ["npm", "--workspace", "apps/web", "run", "start"]
