# syntax=docker/dockerfile:1
# Build context is the repository root: docker build -f apps/web/Dockerfile .

ARG NODE_IMAGE=node:24-trixie-slim@sha256:4d00acb4bcc42c454c4eb801526f7ad7f772ea3bd4fd168c5cc2e384abcbb9d4

FROM ${NODE_IMAGE} AS pruner
WORKDIR /repo
RUN npm install --global turbo@2.11.11
COPY . .
RUN turbo prune web --docker

FROM ${NODE_IMAGE} AS deps
WORKDIR /repo
RUN corepack enable
COPY --from=pruner /repo/out/json/ ./
COPY --from=pruner /repo/out/pnpm-lock.yaml /repo/out/pnpm-workspace.yaml /repo/.npmrc ./
RUN pnpm config set store-dir /pnpm/store
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --offline --frozen-lockfile

FROM deps AS build
ARG APP_ORIGIN=http://localhost:3000
ARG API_URL=http://api:3001
# Build-only placeholder: next.config.ts validates env at build time. It is never
# set in the runtime stage, so it does not ship in the image.
ENV APP_ORIGIN=${APP_ORIGIN} \
  API_URL=${API_URL} \
  SESSION_SECRET=docker-build-only-session-secret-not-used-at-runtime \
  NEXT_TELEMETRY_DISABLED=1 \
  TURBO_TELEMETRY_DISABLED=1
COPY --from=pruner /repo/out/full/ ./
RUN pnpm exec turbo run build --filter=web

FROM ${NODE_IMAGE} AS runtime
# No package manager at runtime: drops npm/corepack/yarn and their CVEs (AC-M12.7, AC-M12.9).
RUN rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx   /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-*
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "apps/web/server.js"]
