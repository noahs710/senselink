import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import {
  getFeed,
  getLeaderboard,
  getUser,
  getUserAchievements,
  getUserDabs,
  getUserStats,
} from './client.js';
import { feedEmbed, leaderboardEmbed, profileEmbed } from './formatters.js';

export async function handleComponent(interaction, _client) {
  const customId = interaction.customId;
  const [action, ...rest] = customId.split(':');

  if (action === 'profile') {
    await interaction.deferUpdate();
    const handle = rest[0];
    const [userRes, stats, achievements] = await Promise.all([
      getUser(handle),
      getUserStats(handle).catch(() => null),
      getUserAchievements(handle).catch(() => []),
    ]);
    if (!userRes?.user) {
      return interaction.editReply({ content: `No user @${handle} found.`, embeds: [], components: [] });
    }
    const embed = profileEmbed(userRes.user, stats?.stats ?? null, achievements?.achievements ?? []);
    return interaction.editReply({
      content: '',
      embeds: [embed],
      components: [makeProfileRow(handle)],
    });
  }

  if (action === 'dabs') {
    await interaction.deferUpdate();
    const handle = rest[0];
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
    const handle = rest[0];
    const [userRes, achievements] = await Promise.all([
      getUser(handle),
      getUserAchievements(handle).catch(() => []),
    ]);
    if (!userRes?.user) {
      return interaction.editReply({ content: `No user @${handle} found.`, embeds: [], components: [] });
    }
    const list = (achievements?.achievements ?? [])
      .filter((a) => a.isVisible !== false)
      .map((a) => `**${a.title}** — ${a.description}`)
      .join('\n') || 'No achievements yet.';
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
    const handle = rest[0];
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
    const h1 = rest[0];
    const h2 = interaction.values[0];
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
    const board = await getLeaderboard(period, 10);
    const embed = leaderboardEmbed(board?.entries, period);
    return interaction.editReply({
      content: '',
      embeds: [embed],
      components: [makeLeaderboardRow()],
    });
  }

  if (action === 'feed') {
    await interaction.deferUpdate();
    const period = interaction.values?.[0] ?? 'recent';
    const feed = await getFeed(10, null, period);
    const entries = feed?.entries ?? feed?.dabs ?? feed?.items ?? [];
    const embed = feedEmbed(entries);
    return interaction.editReply({
      content: '',
      embeds: [embed],
      components: [makeFeedRow()],
    });
  }

  await interaction.reply({ content: 'That interaction is not supported yet.', ephemeral: true });
}

export function makeHelpEmbed() {
  const base = (process.env.PEAKSENSE_API_BASE || 'http://127.0.0.1:8081').replace(/\/$/, '');
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
      { name: '/senselink', value: 'Invite link + this help panel', inline: true },
    )
    .setFooter({ text: 'SenseLink for PeakSense' })
    .setURL(base);
}

function makeProfileRow(handle) {
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

export function makeLeaderboardRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('leaderboard:period')
      .setPlaceholder('Pick a leaderboard period')
      .addOptions(
        { label: 'All time', value: 'all', emoji: '🏆' },
        { label: 'This month', value: 'month', emoji: '📅' },
        { label: 'This week', value: 'week', emoji: '🔥' },
      ),
  );
}

export function makeFeedRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('feed:period')
      .setPlaceholder('Switch feed view')
      .addOptions(
        { label: 'Recent', value: 'recent', emoji: '🆕' },
        { label: 'Trending', value: 'trending', emoji: '🔥' },
      ),
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
