import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCommandHarness, embedDescription } from './_helper.mjs';

process.env.PEAKSENSE_API_BASE = process.env.PEAKSENSE_API_BASE || 'https://peaksense.fly.dev';

const cmds = await import('file:///C:/Users/Gabrielle%20Monlea/Documents/Projects/senselink/src/commands/index.js');
const sockets = await import('file:///C:/Users/Gabrielle%20Monlea/Documents/Projects/senselink/src/peakSocket.js');
const room = cmds.default.find((c) => c.data.name === 'room');

const TEST_CODE = 'ROOMB' + Math.floor(Math.random() * 1e6).toString(36).toUpperCase().slice(0, 4);

test('room-fanout: WS CHAT frame updates the live room embed', async () => {
  const { makeInteraction, messages } = makeCommandHarness();
  const { interaction } = makeInteraction({
    options: { getSubcommand: () => 'join', getInteger: () => undefined, getString: (n) => (n === 'code' ? TEST_CODE : undefined) },
  });
  await room.execute(interaction);
  // Wait for JOINED.
  await new Promise((r) => setTimeout(r, 4500));
  const target = [...messages.keys()][0];
  assert.ok(target, 'expected /room join to produce a message');
  messages.get(target).edits.length = 0;

  const text = 'room-bridge ' + Date.now();
  const sock = sockets.getRoomSocket(TEST_CODE, { nickname: 'bridge-test' });
  const ok = await sock.sendRoomChat(text);
  assert.equal(ok, true, 'sendRoomChat should echo successfully');

  const deadline = Date.now() + 5000;
  let found = null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
    const edits = messages.get(target)?.edits || [];
    found = edits.find((e) => embedDescription(e).includes(text));
    if (found) break;
  }
  sockets.releaseRoomSocket(TEST_CODE);
  assert.ok(found, 'room embed should refresh with the new CHAT frame within 5s');
});