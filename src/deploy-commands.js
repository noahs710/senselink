import commands from './commands/index.js';

import 'dotenv/config';

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_IDS = (process.env.GUILD_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

async function main() {
  if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID) {
    console.error('Missing DISCORD_TOKEN or DISCORD_CLIENT_ID. Set them in .env and run npm run register.');
    process.exit(1);
  }

  const { REST, Routes } = await import('discord.js');
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  const body = commands.map((c) => c.data.toJSON());

  try {
    if (GUILD_IDS.length > 0) {
      for (const guildId of GUILD_IDS) {
        console.log(`Registering commands in guild ${guildId}...`);
        await rest.put(Routes.applicationGuildCommands(DISCORD_CLIENT_ID, guildId), { body });
      }
    } else {
      console.log('Registering commands globally...');
      await rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID), { body });
    }
    console.log(`Registered ${body.length} command(s).`);
  } catch (err) {
    console.error('Failed to register commands:', err);
    process.exit(1);
  }
}

main();
