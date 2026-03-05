/**
 * Server-to-server client for DecentraGuild API. All bot routes require x-bot-secret and x-discord-guild-id.
 */

import { normalizeApiBase } from './normalize-api-base.js'

const BOT_SECRET_HEADER = 'x-bot-secret'
const GUILD_ID_HEADER = 'x-discord-guild-id'

const REQUEST_TIMEOUT_MS = 30_000
const DEFAULT_WAIT_INTERVAL_MS = 3_000
const DEFAULT_WAIT_TIMEOUT_MS = 90_000

/** Thrown when the API returns a non-2xx response. Includes status and optional code from API error body. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST'
  body?: string
  headers?: Record<string, string>
}

async function apiRequest<T>(
  baseUrl: string,
  path: string,
  botSecret: string,
  discordGuildId: string,
  options: RequestOptions & { parseJson: true }
): Promise<T>
async function apiRequest(
  baseUrl: string,
  path: string,
  botSecret: string,
  discordGuildId: string,
  options: RequestOptions & { parseJson?: false }
): Promise<void>
async function apiRequest<T>(
  baseUrl: string,
  path: string,
  botSecret: string,
  discordGuildId: string,
  options: RequestOptions & { parseJson?: boolean }
): Promise<T | void> {
  const url = `${normalizeApiBase(baseUrl)}${path}`
  const headers: Record<string, string> = {
    [BOT_SECRET_HEADER]: botSecret,
    [GUILD_ID_HEADER]: discordGuildId,
    ...options.headers,
  }
  if (options.body) headers['Content-Type'] = 'application/json'
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    if (!res.ok) {
      const text = await res.text()
      let body: { error?: string; code?: string } | undefined
      try {
        body = text ? (JSON.parse(text) as { error?: string; code?: string }) : undefined
      } catch {
        /* use text as message */
      }
      throw new ApiError(
        (body?.error ?? text) || `Request failed ${res.status}`,
        res.status,
        body?.code
      )
    }
    if (options.parseJson) return (await res.json()) as T
  } catch (e) {
    clearTimeout(timeoutId)
    if (e instanceof ApiError) throw e
    throw e instanceof Error ? e : new Error(String(e))
  }
}

/**
 * Poll GET /api/v1/health until the API responds or timeout. Use before first sync when API may still be starting (e.g. cold start).
 */
export async function waitForApi(
  baseUrl: string,
  options?: { intervalMs?: number; timeoutMs?: number }
): Promise<void> {
  const intervalMs = options?.intervalMs ?? DEFAULT_WAIT_INTERVAL_MS
  const timeoutMs = options?.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS
  const started = Date.now()
  let lastError: Error | null = null
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${normalizeApiBase(baseUrl)}/api/v1/health`)
      if (res.ok) return
      lastError = new Error(`Health returned ${res.status}`)
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw lastError ?? new Error('Wait for API timed out')
}

export interface ApiConfig {
  baseUrl: string
  botSecret: string
}

export interface VerifySessionResponse {
  verify_token: string
  expires_at: string
  tenant_slug: string
}

export interface BotContextResponse {
  tenantSlug: string
  discordGuildId: string
  discordModuleState?: string | null
}

export async function getBotContext(
  baseUrl: string,
  botSecret: string,
  discordGuildId: string
): Promise<BotContextResponse> {
  return apiRequest(baseUrl, '/api/v1/discord/bot/context', botSecret, discordGuildId, {
    method: 'GET',
    parseJson: true,
  })
}

export async function createVerifySession(
  baseUrl: string,
  botSecret: string,
  discordGuildId: string,
  discordUserId: string
): Promise<VerifySessionResponse> {
  return apiRequest(baseUrl, '/api/v1/discord/bot/verify/session', botSecret, discordGuildId, {
    method: 'POST',
    body: JSON.stringify({ discord_user_id: discordUserId }),
    parseJson: true,
  })
}

export interface SyncRolePayload {
  id: string
  name: string
  position: number
  color?: number | null
  icon?: string | null
  unicode_emoji?: string | null
}

export async function syncGuildRoles(
  baseUrl: string,
  botSecret: string,
  discordGuildId: string,
  roles: SyncRolePayload[],
  botRolePosition?: number
): Promise<void> {
  const body: { roles: SyncRolePayload[]; bot_role_position?: number } = { roles }
  if (typeof botRolePosition === 'number' && botRolePosition >= 0) body.bot_role_position = botRolePosition
  await apiRequest(baseUrl, '/api/v1/discord/bot/roles', botSecret, discordGuildId, {
    method: 'POST',
    body: JSON.stringify(body),
    parseJson: false,
  })
}

export interface EligibleRoleItem {
  discord_role_id: string
  eligible_discord_user_ids: string[]
}

export async function syncHoldersForGuild(
  baseUrl: string,
  botSecret: string,
  discordGuildId: string
): Promise<{ ok: boolean; results?: Array<{ assetId: string; holderCount: number }> }> {
  return apiRequest(baseUrl, '/api/v1/discord/bot/sync-holders', botSecret, discordGuildId, {
    method: 'POST',
    body: '{}',
    parseJson: true,
  })
}

export async function getEligible(
  baseUrl: string,
  botSecret: string,
  discordGuildId: string,
  memberRoles?: Record<string, string[]>
): Promise<{ eligible: EligibleRoleItem[] }> {
  return apiRequest(baseUrl, '/api/v1/discord/bot/eligible', botSecret, discordGuildId, {
    method: memberRoles != null ? 'POST' : 'GET',
    body: memberRoles != null ? JSON.stringify({ member_roles: memberRoles }) : undefined,
    parseJson: true,
  })
}

export async function scheduleRemovals(
  baseUrl: string,
  botSecret: string,
  discordGuildId: string,
  removals: Array<{ discord_user_id: string; discord_role_id: string }>
): Promise<{ ok: boolean; scheduled: number }> {
  return apiRequest(baseUrl, '/api/v1/discord/bot/schedule-removals', botSecret, discordGuildId, {
    method: 'POST',
    body: JSON.stringify({ removals }),
    parseJson: true,
  })
}

export async function getPendingRemovals(
  baseUrl: string,
  botSecret: string,
  discordGuildId: string
): Promise<{ removals: Array<{ discord_user_id: string; discord_role_id: string }> }> {
  return apiRequest(baseUrl, '/api/v1/discord/bot/pending-removals', botSecret, discordGuildId, {
    method: 'GET',
    parseJson: true,
  })
}

