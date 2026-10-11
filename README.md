# Games, Randomized

Random video game discovery: set filters (genres, platforms, years, Metacritic, popularity), roll, and get one game with screenshots, trailer, studios and a "why this game" explanation. Like/dislike picks to tune the next ones; keep a wishlist and the history of discovered games; search games and studios; browse similar games.

Go (Fiber) API + Angular SPA + PostgreSQL, deployed on DigitalOcean App Platform. Game data from [RAWG](https://rawg.io).

## Quick start

```bash
cp .env.example .env     # set RAWG_API_KEY (https://rawg.io/apidocs) and JWT_SECRET (openssl rand -hex 32)
docker compose up --build
```

Open http://localhost.

## Native development

```bash
docker compose up -d db                                   # or any Postgres 16
cd backend && set -a && . ../.env && set +a && DB_HOST=localhost go run .
cd frontend && npm ci && npm start                        # http://localhost:4200
```

With `docker compose up -d db` the database port is not published; add `ports: ['5432:5432']` to the `db` service or use a local Postgres.

## Tests

```bash
cd backend && go test ./...      # set TEST_DATABASE_URL to also run the DB integration test
cd frontend && npm test && npm run build
```

## Deploy (DigitalOcean App Platform)

1. Create the managed Postgres cluster `games-randomized-db` (or change `databases` in `.do/app.yaml`).
2. Add GitHub secrets: `DIGITALOCEAN_ACCESS_TOKEN`, `JWT_SECRET`, `RAWG_API_KEY`, optionally `AI_GATEWAY_URL` / `AI_GATEWAY_KEY`.
3. Push to `main`: the workflow runs the tests and deploys `.do/app.yaml`.

## Attribution

Game data and images are provided by RAWG; the footer links back to rawg.io as their terms require.
