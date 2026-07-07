import test from 'node:test';
import assert from 'node:assert/strict';

// Unit test for formatChatLine / chatEmbed profile link rendering.
// We import chatEmbed directly and pass a messages array with a
// real handle + profiles map.

const { chatEmbed } = await import('file:///C:/Users/Gabrielle%20Monlea/Documents/Projects/senselink/src/formatters.js');

test('chatEmbed: site user with handle renders as clickable profile link', async () => {
  const messages = [
    { text: 'hello world', handle: 'alice', displayName: 'Alice', createdAt: Date.now() - 5000 },
    { text: 'guest line', displayName: 'GuestUser', createdAt: Date.now() - 1000 },
  ];
  const profiles = new Map([
    ['alice', { handle: 'alice', displayName: 'Alice', avatarUrl: '', profileUrl: 'https://peaksense.fly.dev/u/alice' }],
  ]);
  const embed = chatEmbed({ kind: 'site', messages, profiles });
  const desc = embed.data.description;

  // Alice should have a clickable link
  assert.ok(desc.includes('[Alice](https://peaksense.fly.dev/u/alice)'),
    'expected clickable profile link for Alice, got: ' + desc);
  // GuestUser should be plain bold, no link
  assert.ok(desc.includes('**GuestUser**'),
    'expected plain bold for guest, got: ' + desc);
  assert.ok(!desc.includes('[GuestUser]('),
    'guest should NOT have a link');
  // Relative time should be present (either "just now" or "Xm ago")
  assert.ok(desc.includes('just now') || desc.includes('ago'),
    'expected relative time suffix');
});

test('chatEmbed: handle without resolved profile still gets clickable link', async () => {
  const messages = [
    { text: 'hi from site', handle: 'bob', displayName: 'Bob', createdAt: Date.now() },
  ];
  // No profiles map — simulate profile not yet resolved
  const embed = chatEmbed({ kind: 'site', messages });
  const desc = embed.data.description;
  // Should still have a clickable link constructed from the handle
  assert.ok(desc.includes('[Bob]('), 'expected clickable link from handle alone, got: ' + desc);
  assert.ok(desc.includes('/u/bob'), 'expected /u/bob URL, got: ' + desc);
});

test('chatEmbed: failed line gets warning glyph', async () => {
  const messages = [
    { text: 'oops failed', displayName: 'Bob', _failed: true, createdAt: Date.now() },
  ];
  const embed = chatEmbed({ kind: 'site', messages });
  const desc = embed.data.description;
  assert.ok(desc.includes('⚠'), 'expected warning glyph for failed line, got: ' + desc);
});

test('chatEmbed: setAuthor uses resolved profile when provided', async () => {
  const embed = chatEmbed({
    kind: 'site',
    messages: [{ text: 'hi', displayName: 'Test', createdAt: Date.now() }],
    author: { handle: 'opener', displayName: 'Opener Name', avatarUrl: '', profileUrl: 'https://peaksense.fly.dev/u/opener' },
  });
  const authorData = embed.data.author;
  assert.ok(authorData, 'expected author to be set');
  assert.equal(authorData.name, 'Opener Name');
  assert.equal(authorData.url, 'https://peaksense.fly.dev/u/opener');
});