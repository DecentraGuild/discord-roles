# Discord bot (DecentraGuild)

Standalone bot that serves all linked dGuild Discord servers. It does not connect to the database; it talks to the API with server-to-server auth.l


## What it does

- **/verify** – Sends users a one-time link to the tenant app to link their Solana wallet to their Discord account.
- **Role sync** – On startup and every 15 minutes: fetches holder snapshots from the API, computes who is eligible for each role from the configured rules, adds roles to eligible members, and schedules removals (with grace period) for those who no longer qualify.

## Requirements

- Node 20+
- API running and reachable at `API_BASE_URL`
- Discord app with bot token and **Server Members Intent** enabled (Bot → Privileged Gateway Intents)

## Setup

1. Copy `.env.example` to `.env`.
2. Set `DISCORD_BOT_TOKEN` (Discord Developer Portal → Bot → Reset Token).
3. Set `DISCORD_BOT_API_SECRET` to the same value as the API’s `DISCORD_BOT_API_SECRET`.
4. Set `API_BASE_URL` (e.g. `http://localhost:3001` for local dev).
5. For local dev: set `VERIFY_URL_TEMPLATE=http://localhost:3002/verify?token={{token}}` so /verify links point to the tenant app.

## Run

```bash
pnpm dev    # from repo root: runs with api + tenant
# or
pnpm --filter discord-bot dev
```

The bot waits 5 seconds after connecting so the API can be ready when running with `pnpm dev`.

## Env (see .env.example)

| Variable | Required | Description |
|----------|----------|-------------|
| DISCORD_BOT_TOKEN | Yes | Bot token from Discord Developer Portal |
| DISCORD_BOT_API_SECRET | Yes | Must match API; used for x-bot-secret |
| API_BASE_URL | Yes | Base URL of the DecentraGuild API |
| VERIFY_URL_TEMPLATE | No | Link template for /verify; placeholders `{{slug}}`, `{{token}}` |
| DISCORD_APPLICATION_ID | No | Application ID; used if bot doesn’t have cached app |

