FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN corepack enable && pnpm install

COPY . ./

CMD ["pnpm", "dev", "-p", "3000"]
