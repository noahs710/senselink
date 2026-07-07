import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCommandHarness, embedDescription } from './_helper.mjs';

process.env.PEAKSENSE_API_BASE = process.env.PEAKSENSE_API_BASE || 'https://peaksense.fly.dev';

const mod = await import('file:///C:/Users/Gabrielle%20Monlea/Documents/Projects/senselink/src/commands/index.js');
const sockets = await import('file:///C:/Users/Gabrielle%20Monlea/Documents/Projects/senselink/src/peakSocket.js');
const chat = mod.default.find((c) => c.data.name === 'chat');

test('chat-fanout: HTTP site post updates the live embed', async () => {
  const { makeInteraction, messages } = makeCommandHarness();
  const { interaction } = makeInteraction();
  await chat.execute(interaction);
  await new Promise((r) => setTimeout(r, 2000));
  const target = [...messages.keys()][0];
  assert.ok(target, 'expected /chat join to produce a message');
  messages.get(target).edits.length = 0;

  const text = 'bridge-fanout ' + Date.now();
  const res = await fetch(process.env.PEAKSENSE_API_BASE + '/api/site-chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, guestName: 'bridge-test' }),
  });
  assert.equal(res.status, 201, 'site-chat POST should succeed');

  const deadline = Date.now() + 5000;
  let found = null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
    const edits = messages.get(target)?.edits || [];
    found = edits.find((e) => embedDescription(e).includes(text));
    if (found) break;
  }
  sockets.closeSiteSocket();
  assert.ok(found, 'embed should refresh with the new site-side message within 5s');
});