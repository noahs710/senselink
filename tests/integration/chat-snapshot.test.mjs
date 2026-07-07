import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCommandHarness } from './_helper.mjs';

process.env.PEAKSENSE_API_BASE = process.env.PEAKSENSE_API_BASE || 'https://peaksense.fly.dev';

const mod = await import('file:///C:/Users/Gabrielle%20Monlea/Documents/Projects/senselink/src/commands/index.js');
const sockets = await import('file:///C:/Users/Gabrielle%20Monlea/Documents/Projects/senselink/src/peakSocket.js');
const chat = mod.default.find((c) => c.data.name === 'chat');

test('chat snapshot: produces a markdown file with messages', async () => {
  const { makeInteraction, messages, sentFollowUps } = makeCommandHarness();
  const { interaction } = makeInteraction({
    options: {
      getSubcommand: () => 'snapshot',
      getInteger: () => undefined,
      getString: () => undefined,
    },
  });
  // The snapshot subcommand calls deferReply with ephemeral:true and
  // then editReply with a file.  It also sends the file to the channel.
  // Since our mock doesn't have interaction.channel, that part is skipped.
  await chat.execute(interaction);

  // The ephemeral reply should have a file attachment.
  const target = [...messages.keys()][0];
  assert.ok(target, 'expected a reply message');
  const edit = messages.get(target).edits[0];
  assert.ok(edit.files, 'expected files in the snapshot reply');
  assert.ok(edit.files.length > 0, 'expected at least one file');
  const file = edit.files[0];
  assert.ok(file.name.endsWith('.md'), 'expected .md file, got: ' + file.name);
  sockets.closeSiteSocket();
});