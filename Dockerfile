# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG BUILD_SHA=""
ENV NEXT_TELEMETRY_DISABLED=1 \
    BUILD_SHA=$BUILD_SHA
# public/ is optional in a Next project and git does not track empty
# directories, so guarantee it exists rather than letting the later COPY fail.
RUN mkdir -p public && npx prisma generate && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl su-exec tzdata wget

# The Prisma CLI is needed at runtime to apply migrations, but must not collide
# with the traced node_modules inside the standalone build, so it lives apart.
# Install scripts run deliberately: they fetch the engine binaries at build time
# so the container never reaches the network on start.
RUN npm install --prefix /opt/prisma-cli --no-save prisma@7.10.0 \
    && npm cache clean --force

ARG BUILD_SHA=""
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    DATA_DIR=/app/data \
    BUILD_SHA=$BUILD_SHA

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

VOLUME ["/app/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server.js"]
