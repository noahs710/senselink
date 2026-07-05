import http from 'node:http';
import { Client, Events, GatewayIntentBits, ActivityType } from 'discord.js';
import commands from './commands/index.js';
import { handleComponent } from './components.js';
import { normalizeHandle } from './client.js';
import { searchHandles } from './handles.js';

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const PEAKSENSE_API_BASE = process.env.PEAKSENSE_API_BASE || 'http://127.0.0.1:8081';
const HEALTH_PORT = Number(process.env.HEALTH_PORT || 8080);

if (!DISCORD_TOKEN) {
  console.error('Missing DISCORD_TOKEN. Set it in .env and run npm run register.');
  process.exit(1);
}

// Lightweight HTTP health endpoint for Fly.io checks.
const healthServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    const ready = client.isReady();
    res.writeHead(ready ? 200 : 503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: ready, uptime: process.uptime() }));
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

healthServer.listen(HEALTH_PORT, () => {
  console.log(`Health server listening on :${HEALTH_PORT}`);
});

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
    if (interaction.isAutocomplete()) {
      const focused = interaction.options.getFocused(true);
      if (focused.name === 'handle' || focused.name === 'handle1' || focused.name === 'handle2') {
        const q = normalizeHandle(focused.value);
        const choices = searchHandles(q).map((h) => ({ name: `@${h}`, value: h }));
        return interaction.respond(choices);
      }
      return interaction.respond([]);
    }

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

try {
  await client.login(DISCORD_TOKEN);
} catch (err) {
  console.error('Failed to log in to Discord:', err);
  process.exit(1);
}
