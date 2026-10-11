# CLAUDE.md

Games Randomized — random video game generator, sibling of `film-randomized-complete` (same features minus password reset by email). Data from RAWG.

- **`backend/`** — Go + Fiber v3 + pgx (hand-written SQL) + goose migrations (embedded, run at startup)
- **`frontend/`** — Angular 21 standalone + signals, Transloco (EN/IT inline catalogs), Tailwind v4, Vitest
- Root `docker-compose.yml` runs db + api + web; `.env` at root (see `.env.example`)

## Commands

```bash
# backend/
go run .                 # needs Postgres + JWT_SECRET + RAWG_API_KEY (reads env, no .env loader)
go test ./...            # TestCollectionsFlow needs TEST_DATABASE_URL, skipped otherwise
go vet ./...

# frontend/
npm start                # :4200, proxies /api to 127.0.0.1:8000 (proxy.conf.json)
npm test                 # ng test --watch=false (Vitest)
npm run build

# root
docker compose up --build   # http://localhost
```

## Architecture

- The browser only talks to `/api`. RAWG is reached **through the backend proxy** (`rawg.go`): whitelisted query params, API key added server-side, in-process TTL cache (protects the 20k req/month quota). Keep it that way: never put the RAWG key in the frontend.
- One table `collection_items` with `list` enum (`wishlist` | `discovered`) instead of two tables; `collections.go` registers the same handlers for both lists. POST is idempotent (`ON CONFLICT DO NOTHING`).
- Auth: bcrypt + HS256 JWT (7 days) in `Authorization: Bearer`, token in localStorage (`core/session.ts`). Tokens carry `ver` = `users.token_version`; `requireUser` checks it on every request (one PK lookup), so changing the password revokes other sessions and returns a fresh token. User id goes in `c.Locals("userID")`.
- Client IP for rate limiting comes only from `X-Real-IP`, which nginx overwrites with `$client_ip` (a `map` in `nginx.conf.template`): `$remote_addr` by default, `$http_do_connecting_ip` only when `TRUST_DO_CONNECTING_IP=1` (set in `.do/app.yaml`; DO's edge sets that header). Keep env values free of `$`: App Platform mangles them, which left `proxy_set_header` without a value and crashed nginx. Do not switch back to `X-Forwarded-For`: its leftmost value is client-controlled.
- Errors are `{ statusCode, message, error }` (`errorHandler` in `main.go`); return `fiber.NewError` from handlers.
- `/api/recommend/explain` calls an OpenAI-compatible `chat/completions` endpoint (`AI_GATEWAY_URL`); missing config or failures return an empty explanation, never an error.
- Frontend pick logic is pure and tested in `core/recommendation.ts` (weighted random pick, page-range halving on deep-page 404s, like/dislike profile in localStorage). `DiscoverStore` (root-scoped) orchestrates: page 1 for `count` → random page → details → record in discovered → AI explanation.
- Payload contract: `core/games.ts#toGamePayload` builds exactly the fields `gamePayload` in `collections.go` validates; the spec guards the key set.
- Fiber gotcha: strings from `c.Params`/`c.Queries` are only valid inside the handler; copy them before storing (the RAWG cache key is built with `url.Values.Encode`, which copies).

## Deployment

DigitalOcean App Platform (`.do/app.yaml`): `web` (nginx, proxies `/api` to `api:8000`) + `api` + managed Postgres `games-db` = database `games_randomized`, user `games_app` on the shared cluster `film-randomized-db` (dedicated user so this app cannot touch the other DBs; it was granted `ALL ON SCHEMA public`). `.github/workflows/deploy-digitalocean.yml` tests then deploys on push to `main`. Secrets: `DIGITALOCEAN_ACCESS_TOKEN`, `JWT_SECRET`, `RAWG_API_KEY`, optional `AI_GATEWAY_URL`, `AI_GATEWAY_KEY`.
