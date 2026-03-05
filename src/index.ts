import 'dotenv/config'
import { Client, Events, GatewayIntentBits } from 'discord.js'
import { registerCommands } from './commands.js'
import { handleVerify } from './handlers/verify.js'
import { syncLinkedGuild } from './handlers/sync.js'
import { waitForApi } from './api-client.js'
import {
  DISCORD_BOT_TOKEN,
  hasBotSecret,
  ROLE_SYNC_INTERVAL_MS,
  API_BASE_URL,
  API_READINESS_MAX_WAIT_MS,
  API_READINESS_POLL_MS,
} from './config.js'

const GUILD_SYNC_STAGGER_MS = 2_000

async function main(): Promise<void> {
  if (!DISCORD_BOT_TOKEN) {
    console.error('DISCORD_BOT_TOKEN is required')
    process.exit(1)
  }
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  })

  let syncIntervalId: ReturnType<typeof setInterval> | null = null

  function clearSyncInterval(): void {
    if (syncIntervalId != null) {
      clearInterval(syncIntervalId)
      syncIntervalId = null
    }
  }

  client.once(Events.ClientReady, async () => {
    await registerCommands(client)
    if (!hasBotSecret()) return

    if (API_READINESS_MAX_WAIT_MS > 0) {
      try {
        await waitForApi(API_BASE_URL, {
          timeoutMs: API_READINESS_MAX_WAIT_MS,
          intervalMs: API_READINESS_POLL_MS,
        })
      } catch (err) {
        console.error('API did not become ready in time:', err)
      }
    }

    const guilds = [...client.guilds.cache.values()]
    for (let i = 0; i < guilds.length; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, GUILD_SYNC_STAGGER_MS))
      const guild = guilds[i]
      try {
        await syncLinkedGuild(guild)
      } catch (err) {
        console.error(`Sync failed for guild ${guild.name}:`, err)
      }
    }

    syncIntervalId = setInterval(() => {
      if (!hasBotSecret()) return
      const guilds = [...client.guilds.cache.values()]
      guilds.forEach((guild, i) => {
        const delayMs = i * GUILD_SYNC_STAGGER_MS
        const run = () => syncLinkedGuild(guild).catch((err) => console.error(`Sync interval error ${guild.name}:`, err))
        if (delayMs === 0) run()
        else setTimeout(run, delayMs)
      })
    }, ROLE_SYNC_INTERVAL_MS)
  })

  client.on('guildCreate', async (guild) => {
    if (!hasBotSecret()) return
    try {
      await syncLinkedGuild(guild)
    } catch (err) {
      console.error(`Sync failed for guild ${guild.name}:`, err)
    }
  })

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return
    if (interaction.commandName === 'verify') {
      await handleVerify(interaction)
    }
  })

  process.on('SIGINT', () => {
    clearSyncInterval()
    client.destroy()
    process.exit(0)
  })
  process.on('SIGTERM', () => {
    clearSyncInterval()
    client.destroy()
    process.exit(0)
  })

  await client.login(DISCORD_BOT_TOKEN)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
