import type { Client } from 'discord.js'
import { REST, Routes } from 'discord.js'
import { SlashCommandBuilder } from 'discord.js'
import { DISCORD_BOT_TOKEN } from './config.js'

export async function registerCommands(client: Client): Promise<void> {
  const rest = new REST().setToken(DISCORD_BOT_TOKEN!)
  const commands = [
    new SlashCommandBuilder()
      .setName('verify')
      .setDescription('Link your Solana wallet to your Discord account for role verification')
      .toJSON(),
  ]
  let appId = client.application?.id ?? process.env.DISCORD_APPLICATION_ID
  if (!appId && client.application) {
    const app = await client.application.fetch()
    appId = app.id
  }
  if (!appId) {
    console.error('Cannot register commands: application id not available. Set DISCORD_APPLICATION_ID.')
    return
  }
  await rest.put(Routes.applicationCommands(appId), { body: commands })
}
