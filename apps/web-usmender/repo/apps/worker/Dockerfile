FROM node:20-bullseye-slim

WORKDIR /app

COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./
COPY apps/worker/package.json ./apps/worker/

RUN npm install --workspace apps/worker --include-workspace-root=false

COPY apps/worker ./apps/worker

RUN npm --workspace apps/worker run build

EXPOSE 3003
CMD ["npm", "--workspace", "apps/worker", "run", "start"]
