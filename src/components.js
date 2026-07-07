import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import {
  getLeaderboard,
  getUser,
  getUserAchievements,
  getUserDabs,
  getUserStats,
  getAchievementsCatalog,
  normalizeHandle,
} from './client.js';
import { profileEmbed, profileUrl, formatAchievementsFull } from './formatters.js';
import { handlePaginator, restartPaginator } from './paginator.js';
import { buildScoreTrend } from './chart.js';

export async function handleComponent(interaction, _client) {
  const customId = interaction.customId;
  const [action, ...rest] = customId.split(':');

  if (action === 'pg') {
    return handlePaginator(interaction);
  }

  if (action === 'profile') {
    await interaction.deferUpdate();
    const handle = normalizeHandle(rest[0]);
    const [userRes, stats, achievements, catalog, dabsPage] = await Promise.all([
      getUser(handle),
      getUserStats(handle).catch(() => null),
      getUserAchievements(handle).catch(() => []),
      getAchievementsCatalog(),
      getUserDabs(handle, undefined, 50).catch(() => null),
    ]);
    if (!userRes?.user) {
      return interaction.editReply({ content: `No user @${handle} found.`, embeds: [], components: [] });
    }
    const trend = buildScoreTrend(dabsPage?.dabs ?? []);
    const embed = profileEmbed(
      userRes.user,
      stats?.stats ?? null,
      achievements?.achievements ?? [],
      catalog,
      trend ? 'attachment://score-trend.png' : null,
    );
    const files = trend ? [new AttachmentBuilder(trend, { name: 'score-trend.png' })] : [];
    return interaction.editReply({
      content: '',
      embeds: [embed],
      components: [makeProfileRow(handle)],
      files,
    });
  }

  if (action === 'dabs') {
    await interaction.deferUpdate();
    const handle = normalizeHandle(rest[0]);
    const page = await getUserDabs(handle);
    if (!page?.dabs?.length) {
      return interaction.editReply({ content: `No public dabs for @${handle}.`, embeds: [], components: [] });
    }
    const dabs = page.dabs.slice(0, 10);
    const base = (process.env.PEAKSENSE_API_BASE || 'http://127.0.0.1:8081').replace(/\/$/, '');
    const lines = dabs.map((d) =>
      `• **${d.score}** (${d.grade}) — ${Math.round(d.tempF)}°F, ${Math.round(d.durationS)}s — [view](${base}/dab/${d.id})`,
    );
    return interaction.editReply({
      content: '',
      embeds: [{
        title: `Recent dabs — @${handle}`,
        description: lines.join('\n'),
        color: 0x22c55e,
        footer: { text: 'PeakSense • /dabs' },
      }],
      components: [makeBackRow('profile', handle)],
    });
  }

  if (action === 'achievements') {
    await interaction.deferUpdate();
    const handle = normalizeHandle(rest[0]);
    const [userRes, achievements, catalog] = await Promise.all([
      getUser(handle),
      getUserAchievements(handle).catch(() => []),
      getAchievementsCatalog(),
    ]);
    if (!userRes?.user) {
      return interaction.editReply({ content: `No user @${handle} found.`, embeds: [], components: [] });
    }
    const list = formatAchievementsFull(achievements?.achievements ?? [], catalog);
    return interaction.editReply({
      content: '',
      embeds: [{
        title: `Achievements — @${handle}`,
        description: list,
        color: 0x22c55e,
        footer: { text: 'PeakSense • /profile' },
      }],
      components: [makeBackRow('profile', handle)],
    });
  }

  if (action === 'compare-menu') {
    const handle = normalizeHandle(rest[0]);
    const board = await getLeaderboard('all', 10);
    const options = (board?.entries ?? [])
      .filter((e) => e.user.handle !== handle)
      .slice(0, 24)
      .map((e) => ({
        label: `@${e.user.handle}`,
        value: e.user.handle,
        description: `${e.rating} rating • ${e.bestScore} best`,
      }));
    return interaction.reply({
      ephemeral: true,
      content: `Pick someone to compare with @${handle}:`,
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`compare-run:${handle}`)
            .setPlaceholder('Select a user')
            .addOptions(options.length ? options : [{ label: 'No users available', value: 'none' }]),
        ),
      ],
    });
  }

  if (action === 'compare-run') {
    await interaction.deferUpdate();
    const h1 = normalizeHandle(rest[0]);
    const h2 = normalizeHandle(interaction.values[0]);
    if (h2 === 'none') {
      return interaction.editReply({ content: 'No comparison available.', components: [] });
    }
    const [u1, u2, s1, s2] = await Promise.all([
      getUser(h1),
      getUser(h2),
      getUserStats(h1).catch(() => null),
      getUserStats(h2).catch(() => null),
    ]);
    if (!u1?.user || !u2?.user) {
      return interaction.editReply({ content: 'One of the users was not found.', components: [] });
    }
    const a = s1?.stats ?? {};
    const b = s2?.stats ?? {};
    return interaction.editReply({
      content: '',
      embeds: [{
        title: `${u1.user.displayName} vs ${u2.user.displayName}`,
        description: `| | @${h1} | @${h2} |\n|---|---|---|\n| Rating | ${a.rating ?? '—'} | ${b.rating ?? '—'} |\n| Best | ${a.bestScore ?? '—'} | ${b.bestScore ?? '—'} |\n| Dabs | ${a.totalDabs ?? 0} | ${b.totalDabs ?? 0} |\n| Public | ${a.publicDabs ?? 0} | ${b.publicDabs ?? 0} |\n| Avg | ${a.averageScore ?? '—'} | ${b.averageScore ?? '—'} |`,
        color: 0x22c55e,
      }],
      components: [makeBackRow('profile', h1)],
    });
  }

  if (action === 'leaderboard') {
    await interaction.deferUpdate();
    const period = interaction.values?.[0] ?? 'all';
    return restartPaginator(interaction, 'leaderboard', { period });
  }

  if (action === 'feed') {
    await interaction.deferUpdate();
    const period = interaction.values?.[0] ?? 'recent';
    return restartPaginator(interaction, 'feed', { period });
  }

  
  if (action === 'chatpg') {
    await interaction.deferUpdate();
    const [messageId, dir] = rest;
    // Find the feed entry by messageId across both site and room feeds.
    const { _siteFeeds, _roomFeeds, _refreshFeed } = await import('./commands/index.js');
    let entry = _siteFeeds.get(messageId);
    let kind = 'site';
    let code = null;
    if (!entry) {
      for (const [id, e] of _roomFeeds) {
        if (id === messageId) { entry = e; kind = 'room'; code = e.code; break; }
      }
    }
    if (!entry) {
      return interaction.followUp({ content: 'This chat feed is no longer active.', ephemeral: true }).catch(() => {});
    }
    if (dir === 'older') {
      entry.pageIndex = Math.max(0, (entry.pageIndex || 0) - 1);
    } else if (dir === 'newer') {
      const totalPages = Math.max(1, Math.ceil(entry.messages.length / 10));
      entry.pageIndex = Math.min(totalPages - 1, (entry.pageIndex || 0) + 1);
    }
    _refreshFeed(entry.interaction || interaction, entry, kind, code);
    return;
  }

  if (action === 'site-leave' || action === 'room-leave') {
    await interaction.deferUpdate();
    const { _detachSiteFeedForChannel, _detachRoomFeedForChannel } = await import('./commands/index.js');
    const site = _detachSiteFeedForChannel(interaction.channelId, null, { authorOnly: false });
    const room = _detachRoomFeedForChannel(interaction.channelId, null);
    const stopped = site + room;
    return interaction.followUp({
      content: stopped ? 'Stopped ' + stopped + ' live feed' + (stopped === 1 ? '' : 's') + ' in this channel.' : 'No active live feed in this channel.',
      ephemeral: true,
    }).catch(() => {});
  }
await interaction.reply({ content: 'That interaction is not supported yet.', ephemeral: true });
}

export function makeHelpEmbed() {
  return new EmbedBuilder()
    .setTitle('SenseLink — PeakSense Discord Bot')
    .setDescription(
      'A fast, read-only companion for the PeakSense public API.\n\n' +
      'Use the commands below to browse profiles, dabs, leaderboards, and community feed.\n\n' +
      'Most commands include buttons and dropdowns to keep navigating without retyping.'
    )
    .setColor(0x22c55e)
    .addFields(
      { name: '/profile', value: 'View a public profile + stats + achievements', inline: true },
      { name: '/dab', value: 'Preview any dab by id', inline: true },
      { name: '/leaderboard', value: 'Top ranked dabbers', inline: true },
      { name: '/feed', value: 'Recent or trending public dabs', inline: true },
      { name: '/dabs', value: "List a user's public dabs", inline: true },
      { name: '/compare', value: 'Side-by-side stats duel', inline: true },
      { name: '/share', value: 'Get a profile or dab share URL', inline: true },
      { name: '/chat', value: '`/chat join` opens the site-wide chat live feed; regular messages are forwarded until you `/chat leave`', inline: true },
      { name: '/room', value: '`/room join code:XXX` opens a room feed; regular messages are forwarded until you `/room leave`', inline: true },
      { name: '/senselink', value: 'Invite link + this help panel', inline: true },
    )
    .setFooter({ text: 'SenseLink for PeakSense' });
}

export function makeProfileRow(handle) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Recent dabs')
      .setCustomId(`dabs:${handle}`)
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setLabel('Achievements')
      .setCustomId(`achievements:${handle}`)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setLabel('Compare')
      .setCustomId(`compare-menu:${handle}`)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setLabel('Share profile')
      .setURL(profileUrl(handle))
      .setStyle(ButtonStyle.Link),
  );
}

export function makeBackRow(action, handle) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('← Back to profile')
      .setCustomId(`${action}:${handle}`)
      .setStyle(ButtonStyle.Secondary),
  );
}

export function makeDabRow(shareUrl, handle, dabId) {
  const base = (process.env.PEAKSENSE_API_BASE || 'http://127.0.0.1:8081').replace(/\/$/, '');
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Open on PeakSense')
      .setURL(shareUrl)
      .setStyle(ButtonStyle.Link),
    new ButtonBuilder()
      .setLabel('More from @' + handle)
      .setCustomId(`profile:${handle}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!handle),
    new ButtonBuilder()
      .setLabel('Raw /dab/' + dabId.slice(0, 8))
      .setURL(`${base}/dab/${encodeURIComponent(dabId)}`)
      .setStyle(ButtonStyle.Link),
  );
}
