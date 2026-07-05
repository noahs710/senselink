import { Client, Events, GatewayIntentBits, ActivityType } from 'discord.js';
import commands from './commands/index.js';
import { handleComponent } from './components.js';

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const PEAKSENSE_API_BASE = process.env.PEAKSENSE_API_BASE || 'http://127.0.0.1:8081';

if (!DISCORD_TOKEN) {
  console.error('Missing DISCORD_TOKEN. Set it in .env and run npm run register.');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.commands = new Map();
for (const cmd of commands) {
  client.commands.set(cmd.data.name, cmd);
}

client.once(Events.ClientReady, () => {
  console.log(`SenseLink logged in as ${client.user.tag}`);
  client.user.setActivity({
    name: 'PeakSense leaderboards',
    type: ActivityType.Watching,
  });
  console.log(`PeakSense API base: ${PEAKSENSE_API_BASE}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction, client);
      return;
    }

    if (interaction.isButton() || interaction.isStringSelectMenu()) {
      await handleComponent(interaction, client);
    }
  } catch (err) {
    console.error(err);
    const send = interaction.deferred || interaction.replied
      ? interaction.editReply.bind(interaction)
      : interaction.reply.bind(interaction);
    try {
      await send({ content: '⚠️ Something went wrong.', ephemeral: true });
    } catch {
      // swallow follow-up failures
    }
  }
});

await client.login(DISCORD_TOKEN);
