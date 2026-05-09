FROM node:20-bullseye-slim

WORKDIR /app

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

RUN npm install --workspaces

COPY apps/api ./apps/api
COPY packages/shared ./packages/shared

RUN npm --workspace packages/shared run build
RUN npm --workspace apps/api run prisma:generate
RUN npm --workspace apps/api run build
RUN chmod +x apps/api/docker-entrypoint.sh

EXPOSE 3001
CMD ["./apps/api/docker-entrypoint.sh"]
