FROM node:20-bullseye-slim

WORKDIR /app

COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./
COPY apps/matrix-appservice/package.json ./apps/matrix-appservice/

RUN npm install --workspace apps/matrix-appservice --include-workspace-root=false

COPY apps/matrix-appservice ./apps/matrix-appservice

RUN npm --workspace apps/matrix-appservice run build

EXPOSE 3002
CMD ["npm", "--workspace", "apps/matrix-appservice", "run", "start"]
