import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} from 'discord.js';
import { getLeaderboard, getFeed, getUserDabs } from './client.js';
import {
  leaderboardEmbed,
  feedEmbed,
  dabsListEmbed,
  profileUrl,
  siteUrl,
} from './formatters.js';

/**
 * In-memory cursor paginator for leaderboard / feed / a user's dabs.
 *
 * PeakSense paginates these endpoints with an opaque `nextCursor`. We
 * keep a small per-message history (cursor + cached rows + nextCursor)
 * so Prev/Next/First are instant and don't re-hit the API on back-nav.
 * State is keyed by message id and TTL-evicted; if the bot restarts the
 * buttons report that the session expired and ask the user to re-run.
 *
 * Leaderboard and feed views also carry a period select menu (row 2) so
 * the time window can be switched without re-running the command.
 */

const PAGE_SIZE = 10;
const TTL_MS = 15 * 60 * 1000;
const states = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [id, s] of states) {
    if (now - s.lastTouched > TTL_MS) states.delete(id);
  }
}, 5 * 60 * 1000).unref?.();

async function fetchPage(state, cursor) {
  if (state.kind === 'leaderboard') {
    const res = await getLeaderboard(state.period, PAGE_SIZE, cursor);
    return { rows: res?.entries ?? [], nextCursor: res?.nextCursor ?? null };
  }
  if (state.kind === 'feed') {
    const res = await getFeed(PAGE_SIZE, cursor, state.period);
    const rows = res?.entries ?? res?.dabs ?? res?.items ?? [];
    return { rows, nextCursor: res?.nextCursor ?? null };
  }
  const res = await getUserDabs(state.handle, cursor, PAGE_SIZE);
  return { rows: res?.dabs ?? [], nextCursor: res?.nextCursor ?? null };
}

function buildEmbed(state, page, index) {
  if (state.kind === 'leaderboard') return leaderboardEmbed(page.rows, state.period, index);
  if (state.kind === 'feed') return feedEmbed(page.rows, state.period, index);
  return dabsListEmbed(state.handle, page.rows, index);
}

function webLink(state) {
  if (state.kind === 'dabs') return profileUrl(state.handle);
  return siteUrl();
}

function linkLabel(state) {
  if (state.kind === 'leaderboard') return 'Open leaderboard';
  if (state.kind === 'feed') return 'Open feed';
  return `Open @${state.handle}`;
}

function makeControlsRow(state) {
  const page = state.history[state.index];
  const hasPrev = state.index > 0;
  const hasNext = page?.nextCursor != null;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('pg:first').setLabel('⏮').setStyle(ButtonStyle.Secondary).setDisabled(!hasPrev),
    new ButtonBuilder().setCustomId('pg:prev').setLabel('◀ Prev').setStyle(ButtonStyle.Secondary).setDisabled(!hasPrev),
    new ButtonBuilder().setCustomId('pg:page').setLabel(`Page ${state.index + 1}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId('pg:next').setLabel('Next ▶').setStyle(ButtonStyle.Primary).setDisabled(!hasNext),
    new ButtonBuilder().setLabel(linkLabel(state)).setURL(webLink(state)).setStyle(ButtonStyle.Link),
  );
}

const LB_PERIODS = [
  { label: 'All time', value: 'all', emoji: '🏆' },
  { label: 'This month', value: 'month', emoji: '📅' },
  { label: 'This week', value: 'week', emoji: '🔥' },
];
const FEED_PERIODS = [
  { label: 'Recent', value: 'recent', emoji: '🆕' },
  { label: 'Trending', value: 'trending', emoji: '🔥' },
];

function makeMenuRow(state) {
  let menu;
  if (state.kind === 'leaderboard') {
    menu = new StringSelectMenuBuilder()
      .setCustomId('leaderboard:period')
      .setPlaceholder('Switch leaderboard period')
      .addOptions(LB_PERIODS);
  } else if (state.kind === 'feed') {
    menu = new StringSelectMenuBuilder()
      .setCustomId('feed:period')
      .setPlaceholder('Switch feed view')
      .addOptions(FEED_PERIODS);
  } else {
    return null;
  }
  return new ActionRowBuilder().addComponents(menu);
}

function render(state) {
  const components = [makeControlsRow(state)];
  const menu = makeMenuRow(state);
  if (menu) components.push(menu);
  return { embeds: [buildEmbed(state, state.history[state.index], state.index)], components };
}

function freshState(kind, opts) {
  return {
    kind,
    period: opts.period ?? null,
    handle: opts.handle ?? null,
    history: [],
    index: 0,
    lastTouched: Date.now(),
  };
}

async function loadFirst(state) {
  const first = await fetchPage(state, null);
  state.history.push({ cursor: null, rows: first.rows, nextCursor: first.nextCursor });
  return first.rows;
}

/**
 * Render the first page of a paginated view and register its state.
 * `interaction` must already be deferred (deferReply / deferUpdate).
 */
export async function startPaginator(interaction, kind, opts = {}) {
  const state = freshState(kind, opts);
  try {
    await loadFirst(state);
  } catch {
    return interaction.editReply({ content: 'Could not load that right now. Try again in a moment.' });
  }
  const msg = await interaction.editReply(render(state));
  if (msg?.id) states.set(msg.id, state);
  return true;
}

/**
 * Restart a paginator on an existing message (used by the period select
 * menus). `interaction` must already be deferred via deferUpdate.
 */
export async function restartPaginator(interaction, kind, opts = {}) {
  const state = freshState(kind, opts);
  try {
    await loadFirst(state);
  } catch {
    return interaction.editReply({ content: 'Could not load that right now.', embeds: [], components: [] });
  }
  await interaction.editReply(render(state));
  if (interaction.message?.id) states.set(interaction.message.id, state);
}

/** Handle a paginator button interaction (customId `pg:<dir>`). */
export async function handlePaginator(interaction) {
  const [, dir] = interaction.customId.split(':');
  const state = states.get(interaction.message?.id);
  if (!state) {
    return interaction.reply({
      content: 'This browsing session expired. Re-run the command to keep paging.',
      ephemeral: true,
    });
  }
  state.lastTouched = Date.now();
  await interaction.deferUpdate();

  if (dir === 'next') {
    const page = state.history[state.index];
    if (!page?.nextCursor) return interaction.editReply(render(state));
    try {
      const fetched = await fetchPage(state, page.nextCursor);
      state.history.push({ cursor: page.nextCursor, rows: fetched.rows, nextCursor: fetched.nextCursor });
      state.index = state.history.length - 1;
    } catch {
      return interaction.followUp({ content: 'Could not load the next page.', ephemeral: true });
    }
    return interaction.editReply(render(state));
  }
  if (dir === 'prev') {
    if (state.index <= 0) return interaction.editReply(render(state));
    state.index -= 1;
    return interaction.editReply(render(state));
  }
  if (dir === 'first') {
    state.index = 0;
    return interaction.editReply(render(state));
  }
  return interaction.editReply(render(state));
}
