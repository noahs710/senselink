import test from 'node:test';
import assert from 'node:assert/strict';

// Unit tests for the deep-integration formatters and announcer logic.
// These don't require a live PeakSense API or Discord connection.

import {
  battlesEmbed,
  digestEmbed,
  dotdEmbed,
  liveFeedDabEmbed,
  achievementAnnouncementEmbed,
  rankUpAnnouncementEmbed,
} from './formatters.js';
import { tierForRating } from './announcer.js';

// Helper: extract the title (setDescription text) from an EmbedBuilder.
function embedTitle(embed) {
  return embed?.data?.title;
}
function embedDesc(embed) {
  return embed?.data?.description;
}

test('battlesEmbed: renders open rooms with member count and state', () => {
  const groups = [
    { id: 'g1', name: 'Friday Sesh', memberCount: 5, seshState: 'open' },
    { id: 'g2', name: 'Pro Battle', memberCount: 3, seshState: 'in_progress' },
  ];
  const embed = battlesEmbed(groups);
  assert.equal(embedTitle(embed), '⚔️ Open Battle Rooms');
  const desc = embedDesc(embed);
  // When open rooms exist, only open rooms are shown (in-progress filtered out).
  assert.ok(desc.includes('Friday Sesh'), 'should include open room name');
  assert.ok(desc.includes('5 members'), 'should include member count');
  assert.ok(!desc.includes('Pro Battle'), 'should not include in-progress room when open rooms exist');
});

test('battlesEmbed: shows in-progress rooms when no open rooms exist', () => {
  const groups = [
    { id: 'g2', name: 'Pro Battle', memberCount: 3, seshState: 'in_progress' },
  ];
  const embed = battlesEmbed(groups);
  const desc = embedDesc(embed);
  // No open rooms, so falls back to showing all rooms.
  assert.ok(desc.includes('Pro Battle'), 'should include in-progress room when no open rooms');
});

test('battlesEmbed: shows "no rooms" message for empty list', () => {
  const embed = battlesEmbed([]);
  assert.ok(embedDesc(embed).includes('No public battle rooms'));
});

test('battlesEmbed: handles null input', () => {
  const embed = battlesEmbed(null);
  assert.ok(embedDesc(embed).includes('No public battle rooms'));
});

test('digestEmbed: renders community stats', () => {
  const stats = {
    totalDabs: 1500,
    averageScore: 72.5,
    topDabber: { handle: 'vapeking', displayName: 'VapeKing' },
    mostActive: { handle: 'dailydabber', displayName: 'DailyDabber' },
    newUsers: 12,
    totalPerfectDraws: 45,
  };
  const embed = digestEmbed(stats);
  assert.equal(embedTitle(embed), '📊 Weekly Community Digest');
  const fields = embed.data.fields;
  assert.ok(fields.some((f) => f.name === 'Total Dabs' && f.value === '1500'));
  assert.ok(fields.some((f) => f.name === 'Avg Score' && f.value === '73'));
  assert.ok(fields.some((f) => f.name === 'Top Dabber' && f.value.includes('VapeKing')));
  assert.ok(fields.some((f) => f.name === 'Most Active' && f.value.includes('DailyDabber')));
});

test('digestEmbed: shows error message when stats are null', () => {
  const embed = digestEmbed(null);
  assert.ok(embedDesc(embed).includes('not available'));
  assert.equal(embed.data.color, 0xef4444);
});

test('dotdEmbed: renders dab of the day with score, temp, duration', () => {
  const data = {
    dab: {
      id: 'abc123',
      score: 95,
      grade: 'S',
      tempF: 420,
      durationS: 10,
      isPerfectDraw: true,
      createdAt: '2026-07-15T12:00:00Z',
      user: { handle: 'topdabber', displayName: 'TopDabber', avatarUrl: '' },
    },
  };
  const embed = dotdEmbed(data);
  assert.ok(embedTitle(embed).includes('Dab of the Day'));
  const desc = embedDesc(embed);
  assert.ok(desc.includes('95'));
  assert.ok(desc.includes('420°F'));
  assert.ok(desc.includes('10s'));
  assert.ok(desc.includes('Perfect draw'));
  assert.ok(desc.includes('topdabber'));
});

test('dotdEmbed: shows "not picked yet" when data is null', () => {
  const embed = dotdEmbed(null);
  assert.ok(embedDesc(embed).includes('No Dab of the Day'));
});

test('liveFeedDabEmbed: renders a live feed dab post', () => {
  const dab = {
    id: 'live1',
    score: 88,
    grade: 'A',
    tempF: 410,
    durationS: 8,
    user: { handle: 'liveuser', displayName: 'LiveUser' },
    createdAt: '2026-07-15T14:30:00Z',
  };
  const embed = liveFeedDabEmbed(dab);
  assert.ok(embed);
  assert.ok(embedTitle(embed).includes('LiveUser'));
  assert.ok(embedTitle(embed).includes('88'));
  assert.ok(embedTitle(embed).includes('A'));
});

test('liveFeedDabEmbed: returns null for null input', () => {
  assert.equal(liveFeedDabEmbed(null), null);
});

test('achievementAnnouncementEmbed: renders achievement unlock', () => {
  const info = {
    handle: 'achiever',
    displayName: 'Achiever',
    achievementTitle: 'First Perfect Draw',
    achievementDescription: 'Score a perfect draw',
  };
  const embed = achievementAnnouncementEmbed(info);
  assert.ok(embedTitle(embed).includes('Achiever'));
  assert.ok(embedTitle(embed).includes('unlocked an achievement'));
  const desc = embedDesc(embed);
  assert.ok(desc.includes('First Perfect Draw'));
  assert.ok(desc.includes('Score a perfect draw'));
});

test('rankUpAnnouncementEmbed: renders tier transition', () => {
  const info = {
    handle: 'ranker',
    displayName: 'Ranker',
    oldTier: 'Silver',
    newTier: 'Gold',
    newRating: 1050,
  };
  const embed = rankUpAnnouncementEmbed(info);
  assert.ok(embedTitle(embed).includes('ranked up'));
  const desc = embedDesc(embed);
  assert.ok(desc.includes('Silver'));
  assert.ok(desc.includes('Gold'));
  assert.ok(desc.includes('1050'));
});

test('tierForRating: returns correct tier boundaries', () => {
  assert.equal(tierForRating(0), 'Bronze');
  assert.equal(tierForRating(799), 'Bronze');
  assert.equal(tierForRating(800), 'Silver');
  assert.equal(tierForRating(999), 'Silver');
  assert.equal(tierForRating(1000), 'Gold');
  assert.equal(tierForRating(1200), 'Platinum');
  assert.equal(tierForRating(1400), 'Diamond');
  assert.equal(tierForRating(1600), 'Master');
  assert.equal(tierForRating(1800), 'Grandmaster');
  assert.equal(tierForRating(2000), 'Legend');
  assert.equal(tierForRating(2500), 'Legend');
  assert.equal(tierForRating(null), 'Unranked');
});

test('tierForRating: boundary transitions are detected correctly', () => {
  // Verify that a rating change across a boundary produces a different tier
  const oldTier = tierForRating(799);
  const newTier = tierForRating(800);
  assert.notEqual(oldTier, newTier, '799 and 800 should be different tiers');
  assert.equal(oldTier, 'Bronze');
  assert.equal(newTier, 'Silver');
});