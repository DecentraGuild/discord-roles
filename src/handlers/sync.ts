import type { Guild, GuildMember } from 'discord.js'
import {
  getBotContext,
  syncGuildRoles,
  syncHoldersForGuild,
  getEligible,
  scheduleRemovals,
  getPendingRemovals,
  ApiError,
} from '../api-client.js'
import { API_BASE_URL, DISCORD_BOT_API_SECRET, hasBotSecret } from '../config.js'

const GUILD_NOT_LINKED_CODE = 'GUILD_NOT_LINKED'

/** Fetch all members and return member_roles (user id -> role ids, excluding @everyone) and a member map for reuse. */
async function fetchMemberRolesAndMap(guild: Guild): Promise<{
  memberRoles: Record<string, string[]>
  memberMap: Map<string, GuildMember>
}> {
  const members = await guild.members.fetch()
  const memberRoles: Record<string, string[]> = {}
  const memberMap = new Map<string, GuildMember>()
  const everyoneId = guild.id
  for (const [, member] of members) {
    memberMap.set(member.id, member)
    const roleIds = member.roles.cache
      .filter((r) => r.id !== everyoneId)
      .map((r) => r.id)
    memberRoles[member.id] = roleIds
  }
  return { memberRoles, memberMap }
}

/** Sync holder snapshots (RPC), then compute eligible and apply/remove roles. Requires GuildMembers intent. */
export async function runRoleSyncForGuild(guild: Guild): Promise<void> {
  if (!hasBotSecret()) return

  await syncHoldersForGuild(API_BASE_URL, DISCORD_BOT_API_SECRET!, guild.id)
  const { memberRoles, memberMap } = await fetchMemberRolesAndMap(guild)
  const { eligible } = await getEligible(API_BASE_URL, DISCORD_BOT_API_SECRET!, guild.id, memberRoles)
  if (eligible.length === 0) return

  const toRemove: Array<{ discord_user_id: string; discord_role_id: string }> = []

  for (const { discord_role_id, eligible_discord_user_ids } of eligible) {
    const role = guild.roles.cache.get(discord_role_id)
    if (!role) continue

    const eligibleSet = new Set(eligible_discord_user_ids)

    for (const userId of eligible_discord_user_ids) {
      try {
        const member = memberMap.get(userId) ?? (await guild.members.fetch(userId).catch(() => null))
        if (member && !member.roles.cache.has(discord_role_id)) {
          await member.roles.add(role)
        }
      } catch {
        // Skip on rate limit or missing member
      }
    }

    for (const member of role.members.values()) {
      if (!eligibleSet.has(member.id)) toRemove.push({ discord_user_id: member.id, discord_role_id })
    }
  }

  if (toRemove.length > 0) {
    await scheduleRemovals(API_BASE_URL, DISCORD_BOT_API_SECRET!, guild.id, toRemove)
  }

  const { removals } = await getPendingRemovals(API_BASE_URL, DISCORD_BOT_API_SECRET!, guild.id)
  for (const { discord_user_id, discord_role_id } of removals) {
    try {
      const member =
        memberMap.get(discord_user_id) ?? (await guild.members.fetch(discord_user_id).catch(() => null))
      if (member) await member.roles.remove(discord_role_id)
    } catch {
      // Skip
    }
  }
}

export async function syncLinkedGuild(guild: Guild): Promise<void> {
  if (!hasBotSecret()) return
  try {
    const ctx = await getBotContext(API_BASE_URL, DISCORD_BOT_API_SECRET!, guild.id)
    const roles = guild.roles.cache
      .filter((r) => !r.managed && r.id !== guild.id)
      .map((r) => ({
        id: r.id,
        name: r.name,
        position: r.position,
        color: r.color ?? null,
        icon: r.icon ?? null,
        unicode_emoji: (r as { unicodeEmoji?: string | null }).unicodeEmoji ?? null,
      }))
    const me = guild.members.me
    const botRolePosition = me?.roles?.cache?.reduce((max, r) => Math.max(max, r.position), -1) ?? -1
    await syncGuildRoles(
      API_BASE_URL,
      DISCORD_BOT_API_SECRET!,
      guild.id,
      roles,
      botRolePosition >= 0 ? botRolePosition : undefined,
    )

    if (ctx.discordModuleState === 'active') {
      await runRoleSyncForGuild(guild)
    }
  } catch (err) {
    if (err instanceof ApiError && (err.code === GUILD_NOT_LINKED_CODE || err.status === 404)) return
    throw err
  }
}

