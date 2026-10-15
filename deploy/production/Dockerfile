# Multi-stage image for the NestJS API. Build context is the repository root:
# docker build -f deploy/production/Dockerfile .
# This image does not run migrations automatically. Apply them explicitly after
# a verified backup using the "migrate" target described in compose.yaml.

FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY apps/api/package.json apps/api/package-lock.json ./apps/api/
RUN npm ci --prefix apps/api

COPY . .
RUN npm --prefix apps/api run prisma:generate
RUN npm --prefix apps/api run build

# Target used only for explicit, operator-triggered Prisma migrations.
FROM build AS migrate

# Minimal runtime: production API dependencies plus the generated Prisma client.
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY apps/api/package.json apps/api/package-lock.json ./apps/api/
RUN npm ci --omit=dev --prefix apps/api

COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/node_modules/.prisma ./apps/api/node_modules/.prisma

RUN mkdir -p /var/lib/jotoliko/proofs \
 && chown -R node:node /var/lib/jotoliko
USER node

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/health/ready').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "apps/api/dist/apps/api/src/main.js"]
