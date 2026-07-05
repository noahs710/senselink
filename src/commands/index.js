import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import {
  getDab,
  getDabLikes,
  getFeed,
  getLeaderboard,
  getUser,
  getUserAchievements,
  getUserDabs,
  getUserStats,
  getHealth,
} from '../client.js';
import {
  dabEmbed,
  feedEmbed,
  leaderboardEmbed,
  profileEmbed,
  profileUrl,
  dabUrl,
} from '../formatters.js';
import {
  makeDabRow,
  makeProfileRow,
  makeLeaderboardRow,
  makeFeedRow,
  makeHelpEmbed,
} from '../components.js';

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('profile')
      .setDescription('Show a PeakSense public profile card')
      .addStringOption((o) =>
        o
          .setName('handle')
          .setDescription('PeakSense handle, e.g. noah')
          .setRequired(true),
      ),
    async execute(interaction) {
      await interaction.deferReply();
      const handle = interaction.options.getString('handle').trim().replace(/^@/, '');
      const [userRes, stats, achievements] = await Promise.all([
        getUser(handle),
        getUserStats(handle).catch(() => null),
        getUserAchievements(handle).catch(() => []),
      ]);
      if (!userRes?.user) {
        return interaction.editReply({ content: `No PeakSense user named **@${handle}**.` });
      }
      const embed = profileEmbed(userRes.user, stats?.stats ?? null, achievements?.achievements ?? []);
      return interaction.editReply({ embeds: [embed], components: [makeProfileRow(handle)] });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('dab')
      .setDescription('Preview a PeakSense dab with share link')
      .addStringOption((o) =>
        o
          .setName('id')
          .setDescription('Dab id from the /dab/<id> URL')
          .setRequired(true),
      ),
    async execute(interaction) {
      await interaction.deferReply();
      const id = interaction.options.getString('id').trim();
      const [dabRes, likes] = await Promise.all([
        getDab(id),
        getDabLikes(id).catch(() => null),
      ]);
      if (!dabRes?.dab) {
        return interaction.editReply({ content: `No dab found with id \`${id}\`.` });
      }
      const dab = dabRes.dab;
      const embed = dabEmbed(dab, likes);
      const handle = dab.user?.handle ?? '';
      return interaction.editReply({
        embeds: [embed],
        components: [makeDabRow(dabUrl(id), handle, id)],
      });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('leaderboard')
      .setDescription('PeakSense ELO leaderboard')
      .addStringOption((o) =>
        o
          .setName('period')
          .setDescription('Time window')
          .setRequired(false)
          .addChoices(
            { name: 'All time', value: 'all' },
            { name: 'This month', value: 'month' },
            { name: 'This week', value: 'week' },
          ),
      )
      .addIntegerOption((o) =>
        o
          .setName('limit')
          .setDescription('How many entries (1-25)')
          .setMinValue(1)
          .setMaxValue(25)
          .setRequired(false),
      ),
    async execute(interaction) {
      await interaction.deferReply();
      const period = interaction.options.getString('period') ?? 'all';
      const limit = interaction.options.getInteger('limit') ?? 10;
      const board = await getLeaderboard(period, limit);
      if (!board) {
        return interaction.editReply({ content: 'Could not load the leaderboard right now.' });
      }
      const embed = leaderboardEmbed(board.entries, period);
      return interaction.editReply({ embeds: [embed], components: [makeLeaderboardRow()] });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('feed')
      .setDescription('Recent public dabs from the community')
      .addStringOption((o) =>
        o
          .setName('period')
          .setDescription('Feed filter')
          .setRequired(false)
          .addChoices(
            { name: 'Recent', value: 'recent' },
            { name: 'Trending', value: 'trending' },
          ),
      )
      .addIntegerOption((o) =>
        o
          .setName('limit')
          .setDescription('How many dabs (1-25)')
          .setMinValue(1)
          .setMaxValue(25)
          .setRequired(false),
      ),
    async execute(interaction) {
      await interaction.deferReply();
      const period = interaction.options.getString('period') ?? 'recent';
      const limit = interaction.options.getInteger('limit') ?? 10;
      const feed = await getFeed(limit, null, period);
      if (!feed) {
        return interaction.editReply({ content: 'Could not load the feed right now.' });
      }
      const items = feed.entries ?? feed.dabs ?? feed.items ?? [];
      const embed = feedEmbed(items);
      return interaction.editReply({ embeds: [embed], components: [makeFeedRow()] });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('compare')
      .setDescription('Compare two PeakSense profiles side by side')
      .addStringOption((o) =>
        o
          .setName('handle1')
          .setDescription('First PeakSense handle')
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName('handle2')
          .setDescription('Second PeakSense handle')
          .setRequired(true),
      ),
    async execute(interaction) {
      await interaction.deferReply();
      const h1 = interaction.options.getString('handle1').trim().replace(/^@/, '');
      const h2 = interaction.options.getString('handle2').trim().replace(/^@/, '');
      const [u1, u2, s1, s2] = await Promise.all([
        getUser(h1),
        getUser(h2),
        getUserStats(h1).catch(() => null),
        getUserStats(h2).catch(() => null),
      ]);
      if (!u1?.user || !u2?.user) {
        return interaction.editReply({ content: `One or both handles were not found: @${h1}, @${h2}` });
      }
      const a = s1?.stats ?? {};
      const b = s2?.stats ?? {};
      const embed = new EmbedBuilder()
        .setTitle(`⚔️ ${u1.user.displayName} vs ${u2.user.displayName}`)
        .setDescription(
          `| | @${h1} | @${h2} |\n|---|---|---|\n` +
          `| Rating | ${a.rating ?? '—'} | ${b.rating ?? '—'} |\n` +
          `| Best | ${a.bestScore ?? '—'} | ${b.bestScore ?? '—'} |\n` +
          `| Dabs | ${a.totalDabs ?? 0} | ${b.totalDabs ?? 0} |\n` +
          `| Public | ${a.publicDabs ?? 0} | ${b.publicDabs ?? 0} |\n` +
          `| Avg | ${a.averageScore ?? '—'} | ${b.averageScore ?? '—'} |`,
        )
        .setColor(0x22c55e)
        .setFooter({ text: 'PeakSense • /compare' });
      return interaction.editReply({ embeds: [embed] });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('share')
      .setDescription('Get a PeakSense profile or dab share URL')
      .addSubcommand((sc) =>
        sc
          .setName('profile')
          .setDescription('Profile share URL')
          .addStringOption((o) =>
            o.setName('handle').setDescription('PeakSense handle').setRequired(true),
          ),
      )
      .addSubcommand((sc) =>
        sc
          .setName('dab')
          .setDescription('Dab share URL')
          .addStringOption((o) =>
            o.setName('id').setDescription('Dab id').setRequired(true),
          ),
      ),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand();
      if (sub === 'profile') {
        const handle = interaction.options.getString('handle').trim().replace(/^@/, '');
        return interaction.reply({ content: profileUrl(handle) });
      }
      const id = interaction.options.getString('id').trim();
      return interaction.reply({ content: dabUrl(id) });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('dabs')
      .setDescription('List recent public dabs for a PeakSense user')
      .addStringOption((o) =>
        o
          .setName('handle')
          .setDescription('PeakSense handle')
          .setRequired(true),
      )
      .addIntegerOption((o) =>
        o
          .setName('limit')
          .setDescription('How many (1-25)')
          .setMinValue(1)
          .setMaxValue(25)
          .setRequired(false),
      ),
    async execute(interaction) {
      await interaction.deferReply();
      const handle = interaction.options.getString('handle').trim().replace(/^@/, '');
      const limit = interaction.options.getInteger('limit') ?? 10;
      const page = await getUserDabs(handle);
      if (!page?.dabs?.length) {
        return interaction.editReply({ content: `No public dabs found for @${handle}.` });
      }
      const dabs = page.dabs.slice(0, limit);
      const lines = dabs.map((d) =>
        `• **${d.score}** (${d.grade}) — ${Math.round(d.tempF)}°F, ${Math.round(d.durationS)}s — [view](${dabUrl(d.id)})`,
      );
      const embed = new EmbedBuilder()
        .setTitle(`Recent dabs — @${handle}`)
        .setDescription(lines.join('\n'))
        .setColor(0x22c55e)
        .setFooter({ text: 'PeakSense • /dabs' });
      return interaction.editReply({ embeds: [embed] });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('status')
      .setDescription('Check PeakSense API status and bot latency')
      .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),
    async execute(interaction) {
      await interaction.deferReply();
      const start = Date.now();
      const health = await getHealth().catch(() => null);
      const ms = Date.now() - start;
      const embed = new EmbedBuilder()
        .setTitle('SenseLink status')
        .setColor(health ? 0x22c55e : 0xef4444)
        .addFields(
          { name: 'API reachable', value: health ? '✅ Yes' : '❌ No', inline: true },
          { name: 'Latency', value: `${ms}ms`, inline: true },
          { name: 'PeakSense base', value: process.env.PEAKSENSE_API_BASE || 'http://127.0.0.1:8081', inline: true },
        )
        .setFooter({ text: 'SenseLink for PeakSense' });
      return interaction.editReply({ embeds: [embed] });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('senselink')
      .setDescription('Bot info, help, and invite link')
      .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),
    async execute(interaction) {
      const invite = `https://discord.com/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&scope=bot%20applications.commands`;
      const embed = makeHelpEmbed().setDescription(
        makeHelpEmbed().data.description + `\n\n[Add SenseLink to your server](${invite})`,
      );
      return interaction.reply({ embeds: [embed] });
    },
  },
];

export default commands;
export { SlashCommandBuilder };
