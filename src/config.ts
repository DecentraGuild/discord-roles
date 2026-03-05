/**
 * Bot config. Secrets from env; other defaults in constants below (override via env when needed).
 */

const DEFAULT_API_BASE_URL = 'http://localhost:3001'
const DEFAULT_VERIFY_URL_TEMPLATE = 'https://{{slug}}.dguild.org/verify?token={{token}}'
const DEFAULT_API_READINESS_MAX_WAIT_MS = 30_000
const DEFAULT_API_READINESS_POLL_MS = 1_000
const DEFAULT_ROLE_SYNC_INTERVAL_MS = 15 * 60 * 1000

export const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN
const rawApiBaseUrl = process.env.API_BASE_URL ?? DEFAULT_API_BASE_URL
export const API_BASE_URL = rawApiBaseUrl.replace(/\/+$/, '')
export const DISCORD_BOT_API_SECRET = process.env.DISCORD_BOT_API_SECRET
const VERIFY_URL_TEMPLATE = process.env.VERIFY_URL_TEMPLATE ?? DEFAULT_VERIFY_URL_TEMPLATE

/** Max time to wait for API health before starting sync. Set to 0 to skip. Override with API_READINESS_MAX_WAIT_MS. */
export const API_READINESS_MAX_WAIT_MS = Number(process.env.API_READINESS_MAX_WAIT_MS ?? DEFAULT_API_READINESS_MAX_WAIT_MS)
/** Interval between health checks while waiting for API. Override with API_READINESS_POLL_MS. */
export const API_READINESS_POLL_MS = Number(process.env.API_READINESS_POLL_MS ?? DEFAULT_API_READINESS_POLL_MS)

export function hasBotSecret(): boolean {
  return Boolean(DISCORD_BOT_API_SECRET)
}

export function buildVerifyUrl(tenantSlug: string, token: string): string {
  return VERIFY_URL_TEMPLATE
    .replace(/\{\{\s*slug\s*\}\}/gi, encodeURIComponent(tenantSlug))
    .replace(/\{\{\s*token\s*\}\}/gi, encodeURIComponent(token))
}

/** Interval between role sync runs. Override with DISCORD_ROLE_SYNC_INTERVAL_MS. */
export const ROLE_SYNC_INTERVAL_MS = Number(process.env.DISCORD_ROLE_SYNC_INTERVAL_MS ?? DEFAULT_ROLE_SYNC_INTERVAL_MS)
