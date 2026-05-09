FROM node:20-alpine AS build

WORKDIR /app
ARG APP_NAME
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json tsconfig.base.json ./
COPY tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

RUN npm ci
RUN npm --workspace "apps/${APP_NAME}" run build


FROM node:20-alpine AS runner

WORKDIR /app
ARG APP_NAME
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    APP_NAME=${APP_NAME} \
    HOST=0.0.0.0 \
    PORT=3000

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json
COPY --from=build /app/tsconfig.base.json ./tsconfig.base.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps ./apps
COPY --from=build /app/packages ./packages

EXPOSE 3000

CMD ["sh", "-lc", "npm --workspace \"apps/${APP_NAME}\" run start"]
