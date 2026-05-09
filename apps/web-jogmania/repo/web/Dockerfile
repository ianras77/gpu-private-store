FROM node:20-alpine

WORKDIR /repo
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install
COPY . .

EXPOSE 3000
CMD ["pnpm", "dev", "-p", "3000", "--hostname", "0.0.0.0"]
