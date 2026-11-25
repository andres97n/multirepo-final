# multirepo-final

NestJS + Next.js + TypeScript monorepo boilerplate. See [docs/prd.md](docs/prd.md) and [docs/plan.md](docs/plan.md).

## Quick start

```bash
pnpm install
pnpm lint && pnpm typecheck
pnpm dev:db   # MongoDB for local dev (compose.dev.yaml)
```

(Full quick start arrives with M15.)

## Run with Docker

Production-like stack (api, web and the selected database) from `compose.yaml`. See ADR-0012.

```bash
cp docker/api.env.example docker/api.env   # fill JWT_ACCESS_SECRET (openssl rand -base64 48)
cp docker/web.env.example docker/web.env   # fill SESSION_SECRET (openssl rand -base64 48)
docker compose up -d --build --wait        # api :3001, web :3000 on 127.0.0.1, all healthy
docker compose run --rm api node dist/infra/database/postgres/migrate.js   # Postgres only: migrations
docker compose down                        # add -v to drop the database volume
pnpm docker:smoke                          # build, start, check health/non-root/leaks/SIGTERM, tear down
```

`APP_ORIGIN` is baked into the web image at build time (`APP_ORIGIN=https://app.example.com docker compose build web`) and must match `docker/web.env`.
