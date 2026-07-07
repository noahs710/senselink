import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import {
  getDab,
  getDabLikes,
  getUser,
  getUserAchievements,
  getUserDabs,
  getUserStats,
  getHealth,
  getAchievementsCatalog,
  normalizeHandle,
  normalizeDabId,
  normalizeRoomCode,
  trimChat,
  getSiteChat,
} from '../client.js';
import {
  dabEmbed,
  profileEmbed,
  profileUrl,
  dabUrl,
  chatEmbed,
} from '../formatters.js';
import {
  makeDabRow,
  makeProfileRow,
  makeHelpEmbed,
} from '../components.js';
import { startPaginator } from '../paginator.js';
import { getSiteSocket, getRoomSocket } from '../peakSocket.js';
import { buildScoreTrend, buildDabTraceGraph } from '../chart.js';

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('profile')
      .setDescription('Show a PeakSense public profile card')
      .addStringOption((o) =>
        o
          .setName('handle')
          .setDescription('PeakSense handle or display name (spaces ok)')
          .setRequired(true)
          .setAutocomplete(true),
      ),
    async execute(interaction) {
      await interaction.deferReply();
      const handle = normalizeHandle(interaction.options.getString('handle'));
      const [userRes, stats, achievements, catalog, dabsPage] = await Promise.all([
        getUser(handle),
        getUserStats(handle).catch(() => null),
        getUserAchievements(handle).catch(() => []),
        getAchievementsCatalog(),
        getUserDabs(handle, undefined, 50).catch(() => null),
      ]);
      if (!userRes?.user) {
        return interaction.editReply({ content: `No PeakSense user named **@${handle}**.` });
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
      return interaction.editReply({ embeds: [embed], components: [makeProfileRow(handle)], files });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('dab')
      .setDescription('Preview a PeakSense dab with share link')
      .addStringOption((o) =>
        o
          .setName('id')
          .setDescription('Dab id, or paste the full /dab/<id> link')
          .setRequired(true),
      ),
    async execute(interaction) {
      await interaction.deferReply();
      const id = normalizeDabId(interaction.options.getString('id'));
      const [dabRes, likes] = await Promise.all([
        getDab(id),
        getDabLikes(id).catch(() => null),
      ]);
      if (!dabRes?.dab) {
        return interaction.editReply({ content: `No dab found with id \`${id}\`.` });
      }
      const dab = dabRes.dab;
      const trace = buildDabTraceGraph(dab);
      const embed = dabEmbed(dab, likes, trace ? 'attachment://dab-trace.png' : null);
      const handle = dab.user?.handle ?? '';
      const files = trace ? [new AttachmentBuilder(trace, { name: 'dab-trace.png' })] : [];
      return interaction.editReply({
        embeds: [embed],
        components: [makeDabRow(dabUrl(id), handle, id)],
        files,
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
      ),
    async execute(interaction) {
      await interaction.deferReply();
      const period = interaction.options.getString('period') ?? 'all';
      return startPaginator(interaction, 'leaderboard', { period });
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
      ),
    async execute(interaction) {
      await interaction.deferReply();
      const period = interaction.options.getString('period') ?? 'recent';
      return startPaginator(interaction, 'feed', { period });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('compare')
      .setDescription('Compare two PeakSense profiles side by side')
      .addStringOption((o) =>
        o
          .setName('handle1')
          .setDescription('First PeakSense handle or display name')
          .setRequired(true)
          .setAutocomplete(true),
      )
      .addStringOption((o) =>
        o
          .setName('handle2')
          .setDescription('Second PeakSense handle or display name')
          .setRequired(true)
          .setAutocomplete(true),
      ),
    async execute(interaction) {
      await interaction.deferReply();
      const h1 = normalizeHandle(interaction.options.getString('handle1'));
      const h2 = normalizeHandle(interaction.options.getString('handle2'));
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
            o.setName('handle').setDescription('PeakSense handle or display name').setRequired(true).setAutocomplete(true),
          ),
      )
      .addSubcommand((sc) =>
        sc
          .setName('dab')
          .setDescription('Dab share URL')
          .addStringOption((o) =>
            o.setName('id').setDescription('Dab id or /dab/<id> link').setRequired(true),
          ),
      ),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand();
      if (sub === 'profile') {
        const handle = normalizeHandle(interaction.options.getString('handle'));
        return interaction.reply({ content: profileUrl(handle) });
      }
      const id = normalizeDabId(interaction.options.getString('id'));
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
          .setDescription('PeakSense handle or display name')
          .setRequired(true)
          .setAutocomplete(true),
      ),
    async execute(interaction) {
      await interaction.deferReply();
      const handle = normalizeHandle(interaction.options.getString('handle'));
      if (!handle) {
        return interaction.editReply({ content: 'That does not look like a valid handle.' });
      }
      return startPaginator(interaction, 'dabs', { handle });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('status')
      .setDescription('Check PeakSense API status and bot latency'),
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
      .setDescription('Bot info, help, and invite link'),
    async execute(interaction) {
      const invite = `https://discord.com/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&scope=bot%20applications.commands`;
      const help = makeHelpEmbed();
      help.setDescription(help.data.description + `\n\n[Add SenseLink to your server](${invite})`);
      return interaction.reply({ embeds: [help] });
    },
  },
];

export default commands;
export const forwardChannelMessage = _forwardChannelMessageToLiveFeeds;

export { SlashCommandBuilder };


// ---------------------------------------------------------------------------
// Live chat: per-message socket registry keyed by Discord message id. When a
// user invokes /chat join or /room join, the bot edits the SAME message in
// place as new lines arrive over the WebSocket. Keying on message id (not
// the slash invocation) lets multiple users in the same channel each have
// their own feed without stepping on each other; the registry is best-effort
// and dropped on close/error to avoid leaks.
//
// Two posting paths:
//   - /chat say <text>             -> site chat (always available via WS)
//   - /room say code:XXX <text>    -> connected room (auto-joins if needed)
// ---------------------------------------------------------------------------

const _siteFeeds = new Map(); // messageId -> { socket, detach, messages }
const _roomFeeds = new Map(); // messageId -> { socket, detach, code, role, messages }
// _roomSessions tracks the active live room-chat embed per channel
// keyed by room code, so /room say can detect when the caller has
// /room join open for the same code in the same channel and switch
// into silent mode. The embed itself is still keyed by messageId in
// _roomFeeds; the sessions map is the which embed is currently
// active for code ABC in channel X lookup.
const _roomSessions = new Map(); // key = `${channelId}:${code}` -> { entry, messageId, code }

// Detach every active live room-chat embed in a channel. When
// code is provided, only that code is detached; otherwise every
// room feed in the channel is detached (matches /room leave UX).
function _detachRoomFeedForChannel(channelId, code) {
  if (!channelId) return 0;
  let detached = 0;
  for (const [messageId, entry] of _roomFeeds) {
    if (entry.channelId !== channelId) continue;
    if (code && entry.code !== code) continue;
    try { entry.detach && entry.detach(); } catch { /* ignore */ }
    _roomFeeds.delete(messageId);
    if (entry.code) {
      const key = channelId + ":" + entry.code;
      const sess = _roomSessions.get(key);
      if (sess && sess.messageId === messageId) _roomSessions.delete(key);
    }
    detached++;
  }
  return detached;
}

// _siteSessions tracks the active live site-chat embed per channel
// so /chat say can detect when the caller has /chat join open here
// and switch into silent mode. The embed itself is still keyed by
// messageId in _siteFeeds (multiple embeds per channel are allowed,
// but the active one is the most recent join that has not been left).
const _siteSessions = new Map(); // channelId -> { entry, messageId }

// Best-effort display name for a Discord user, used when a /chat say
// post needs a guestName to ride the WS frame. Falls back to the
// username, then Guest.
function guestNameFromUser(user) {
  if (!user) return "Guest";
  const name = (user.globalName || user.username || "Guest").toString().slice(0, 40);
  return name || "Guest";
}

// Detach every active live site-chat embed in a channel (or just the
// caller authorOnly session). Removes the _siteFeeds entry,
// unsubscribes the socket listener, and clears the per-channel
// _siteSessions pointer. Returns the number of feeds detached so
// /chat leave can report what happened.
function _detachSiteFeedForChannel(channelId, _authorId, opts) {
  const authorOnly = !!(opts && opts.authorOnly);
  if (!channelId) return 0;
  let detached = 0;
  for (const [messageId, entry] of _siteFeeds) {
    if (entry.channelId !== channelId) continue;
    if (authorOnly && entry.authorId && entry.authorId !== _authorId) continue;
    try { entry.detach && entry.detach(); } catch { /* ignore */ }
    _siteFeeds.delete(messageId);
    const sess = _siteSessions.get(channelId);
    if (sess && sess.messageId === messageId) _siteSessions.delete(channelId);
    detached++;
  }
  return detached;
}





// Per-author rate limit for the textwatcher. Discord lets the same user
// post 5 channel messages per 5 s by default; we allow 1 forwarded post per
// 2 s so a fat-fingered spam cannot burn through the site-chat rate budget.
const _textwatcherCooldown = new Map(); // userId -> { until: number }
const TEXTWATCHER_COOLDOWN_MS = 2000;

// Forward a regular channel message to every active live feed in the
// channel. Used by the bot textwatcher; /chat say and /room say were
// removed in favor of this single path. Returns the number of feeds the
// message was delivered to (0 means nothing was active).
function _forwardChannelMessageToLiveFeeds(message) {
  if (!message || !message.channelId) return 0;
  if (message.author && message.author.bot) return 0;
  if (typeof message.content !== 'string' || !message.content) return 0;
  const raw = message.content.replace(/<@!?\d+>/g, '').trim();
  if (!raw) return 0;
  if (raw.startsWith('/')) return 0;
  const userId = (message.author && message.author.id) || '';
  const now = Date.now();
  const last = _textwatcherCooldown.get(userId);
  if (last && last.until > now) return 0;
  _textwatcherCooldown.set(userId, { until: now + TEXTWATCHER_COOLDOWN_MS });
  let forwarded = 0;

  // Site chat
  const site = _siteSessions.get(message.channelId);
  if (site && site.entry) {
    const text = trimChat(raw, 280);
    if (text) {
      const displayName = guestNameFromUser(message.author);
      site.entry.messages.push({ text, displayName, _local: true, _serverEchoed: false, createdAt: now });
      if (site.entry.messages.length > 50) site.entry.messages.splice(0, site.entry.messages.length - 50);
      _refreshFeed(site.entry.interaction || message, site.entry, 'site');
      (async () => {
        try {
          const sock = getSiteSocket();
          const ok = await sock.sendSiteChat(text, displayName);
          if (!ok) {
            const last = site.entry.messages[site.entry.messages.length - 1];
            if (last && last.text === text && last.displayName === displayName) last._failed = true;
            _refreshFeed(site.entry.interaction || message, site.entry, 'site');
          }
        } catch (err) {
          console.error('textwatcher site send failed', err);
        }
      })();
      forwarded++;
    }
  }

  // Every active room feed in this channel.
  for (const [key, sess] of _roomSessions) {
    if (!key.startsWith(message.channelId + ':')) continue;
    if (!sess || !sess.entry) continue;
    const text = trimChat(raw, 200);
    if (!text) continue;
    const nickname = trimChat(sess.entry.authorName || guestNameFromUser(message.author), 24) || 'SenseLink';
    sess.entry.messages.push({ text, nickname, _local: true, _serverEchoed: false });
    if (sess.entry.messages.length > 50) sess.entry.messages.splice(0, sess.entry.messages.length - 50);
    _refreshFeed(sess.entry.interaction || message, sess.entry, 'room', sess.entry.code);
    const sock = sess.entry.socket || (sess.entry.code ? getRoomSocket(sess.entry.code, { nickname }) : null);
    sess.entry.socket = sock;
    if (sock) {
      (async () => {
        try {
          if (!sock.connected || !sock.room || sock.room.code !== sess.entry.code) sock.joinRoom(sess.entry.code, { nickname, role: 'spectator' });
          const ok = await sock.sendRoomChat(text);
          if (!ok) {
            const last = sess.entry.messages[sess.entry.messages.length - 1];
            if (last && last.text === text && last.nickname === nickname) last._failed = true;
            _refreshFeed(sess.entry.interaction || message, sess.entry, 'room', sess.entry.code);
          }
        } catch (err) {
          console.error('textwatcher room send failed', err);
        }
      })();
    }
    forwarded++;
  }

  return forwarded;
}

function _recentMessages(messages, max = 25) {
  return messages.slice(-max);
}
function _siteFeedRows(_messageId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Open site chat")
        .setStyle(ButtonStyle.Link)
        .setURL(`${(process.env.PEAKSENSE_API_BASE || "http://127.0.0.1:8081").replace(/\/$/, "")}/`),
      new ButtonBuilder()
        .setLabel("Leave chat")
        .setCustomId("site-leave")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function _roomFeedRows(_messageId, _code) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Open in PeakSense")
        .setStyle(ButtonStyle.Link)
        .setURL(`${(process.env.PEAKSENSE_API_BASE || "http://127.0.0.1:8081").replace(/\/$/, "")}/`),
      new ButtonBuilder()
        .setLabel("Leave room")
        .setCustomId("room-leave")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}





// Module-load wiring: when the bot first needs the global site socket
// we attach a fan-out listener that pushes every SITE_CHAT frame into
// every active site session. This is the single place that updates the
// live embed for messages that arrive via the WS broadcast (whether
// they originated from a Discord user typing in the channel, from the
// textwatcher, or from a site-side post over the HTTP /api/site-chat
// endpoint).
let _siteFanoutWired = false;
function _wireSiteSocketFanout() {
  if (_siteFanoutWired) return;
  _siteFanoutWired = true;
  const sock = getSiteSocket();
  sock.on((t, d) => {
    if (t !== 'SITE_CHAT') return;
    if (!d || !d.text) return;
    for (const sess of _siteSessions.values()) {
      if (!sess || !sess.entry) continue;
      const entry = sess.entry;
      // De-dupe: the textwatcher pre-pushes the line into the feed before
      // sending; the server echo that comes back should mark that row as
      // confirmed rather than append a duplicate.
      const last = entry.messages[entry.messages.length - 1];
      if (last && last.text === d.text && (last.displayName || '') === (d.displayName || '') && !last._serverEchoed) {
        last._serverEchoed = true;
        _refreshFeed(entry.interaction || { editReply: async () => {} }, entry, 'site');
        continue;
      }
      entry.messages.push(d);
      if (entry.messages.length > 50) entry.messages.splice(0, entry.messages.length - 50);
      _refreshFeed(entry.interaction || { editReply: async () => {} }, entry, 'site');
    }
  });
}



// Module-load wiring: per-room-code fan-out. When the first /room join for
// a given code happens we attach a listener to the shared room socket
// that pushes every CHAT frame into every active room session in this
// channel. The shared socket is created lazily by getRoomSocket; the
// first listener on it stays attached for the lifetime of the bot so
// later /room join calls in the same channel all see the same stream.
const _roomFanoutByCode = new Set();
function _wireRoomSocketFanout(code) {
  if (_roomFanoutByCode.has(code)) return;
  _roomFanoutByCode.add(code);
  const sock = getRoomSocket(code, { nickname: 'SenseLink' });
  sock.on((t, d) => {
    if (t !== 'CHAT') return;
    if (!d || !d.text) return;
    for (const [key, sess] of _roomSessions) {
      if (!key.endsWith(':' + code)) continue;
      if (!sess || !sess.entry) continue;
      const entry = sess.entry;
      const last = entry.messages[entry.messages.length - 1];
      if (last && last.text === d.text && (last.nickname || '') === (d.nickname || '') && !last._serverEchoed) {
        last._serverEchoed = true;
        _refreshFeed(entry.interaction || { editReply: async () => {} }, entry, 'room', code);
        continue;
      }
      entry.messages.push(d);
      if (entry.messages.length > 50) entry.messages.splice(0, entry.messages.length - 50);
      _refreshFeed(entry.interaction || { editReply: async () => {} }, entry, 'room', code);
    }
  });
}

async function _refreshFeed(interaction, entry, kind, code) {
  const list = _recentMessages(entry.messages);
  const embed = chatEmbed({
    kind,
    code,
    messages: list,
    pageIndex: 0,
    totalPages: 1,
  });
  try {
    await interaction.editReply({
      embeds: [embed],
      components: kind === 'site' ? _siteFeedRows(entry.messageId) : _roomFeedRows(entry.messageId, code),
    });
  } catch (err) {
    // Message may have been deleted; just drop the feed.
    if (kind === 'site') _siteFeeds.delete(entry.messageId);
    else _roomFeeds.delete(entry.messageId);
  }
}





const _chatCmd = {
  data: new SlashCommandBuilder()
    .setName('chat')
    .setDescription('Live site-chat feed. While open, regular messages here are forwarded to site chat.')
    .addSubcommand((sc) =>
      sc
        .setName('join')
        .setDescription('Open a live site-chat feed. Non-command messages are forwarded to site chat.')
        .addIntegerOption((o) =>
          o
            .setName('limit')
            .setDescription('How many recent messages to seed the feed with (1-50)')
            .setMinValue(1)
            .setMaxValue(50)
            .setRequired(false),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName('leave')
        .setDescription('Stop forwarding regular messages to site chat here.'),
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const channelId = interaction.channelId;

    if (sub === 'leave') {
      const detached = _detachSiteFeedForChannel(channelId, interaction.user?.id, { authorOnly: false });
      if (detached > 0) {
        return interaction.reply({ content: 'Stopped the live site-chat feed in this channel. Regular messages are no longer forwarded.', ephemeral: true });
      }
      return interaction.reply({ content: 'No active site-chat feed in this channel.', ephemeral: true });
    }

    // sub === 'join'
    // If a live feed is already bound to this channel, detach it first
    // so the new one becomes the single source of truth (last-writer
    // wins per channel; multiple users in the same channel share the
    // embed).
    _detachSiteFeedForChannel(channelId, null, { authorOnly: false });

    const limit = interaction.options.getInteger('limit') ?? 25;
    await interaction.deferReply();
    const history = await getSiteChat(limit).catch(() => null);
    const messages = (history && Array.isArray(history.messages)) ? history.messages.slice().reverse() : [];
    const embed = chatEmbed({ kind: 'site', messages });
    const rows = _siteFeedRows('0');
    const reply = await interaction.editReply({ embeds: [embed], components: rows, fetchReply: true });

    const entry = {
      messageId: reply.id,
      channelId,
      authorId: interaction.user?.id || null,
      authorName: guestNameFromUser(interaction.user),
      messages,
      detach: null,
      interaction: { ...interaction, message: reply },
    };
    _siteFeeds.set(reply.id, entry);
    _siteSessions.set(channelId, { entry, messageId: reply.id });

    // Pre-warm the global site socket so the first forwarded message
    // does not pay the connect latency. _wireSiteSocketFanout attaches
    // the single listener that pushes every SITE_CHAT frame into every
    // active site session, so site-side posts (HTTP path) refresh the
    // embed just like Discord-side posts do.
    _wireSiteSocketFanout();
    getSiteSocket();
    entry.detach = () => {};

    return reply;
  },
};
commands.push(_chatCmd);




const _roomCmd = {
  data: new SlashCommandBuilder()
    .setName('room')
    .setDescription('Live room feed. While open, regular messages here are forwarded to the room.')
    .addSubcommand((sc) =>
      sc
        .setName('join')
        .setDescription('Open a live room feed. Non-command messages are forwarded to the room.')
        .addStringOption((o) =>
          o
            .setName('code')
            .setDescription('Room code (e.g. AB12CD). Case-insensitive, max 32 chars, A-Z0-9 only.')
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(40),
        )
        .addStringOption((o) =>
          o
            .setName('role')
            .setDescription('How to join (default: spectator)')
            .setRequired(false)
            .addChoices(
              { name: 'Spectator (just watch)', value: 'spectator' },
              { name: 'Competitor (play along)', value: 'competitor' },
            ),
        )
        .addStringOption((o) =>
          o
            .setName('nickname')
            .setDescription('Display name inside the room (max 24 chars). Defaults to your Discord name.')
            .setRequired(false)
            .setMaxLength(24),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName('leave')
        .setDescription('Stop forwarding regular messages to rooms here.'),
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const channelId = interaction.channelId;

    if (sub === 'leave') {
      const detached = _detachRoomFeedForChannel(channelId, null);
      return interaction.reply({
        content: detached
          ? `Stopped ${detached} room feed${detached === 1 ? '' : 's'} in this channel.`
          : 'No active room feeds in this channel.',
        ephemeral: true,
      });
    }

    // sub === 'join'
    const raw = interaction.options.getString('code');
    const code = normalizeRoomCode(raw);
    if (!code) {
      return interaction.reply({ content: 'That room code is empty after cleanup. Use letters and digits, max 32.', ephemeral: true });
    }
    const role = interaction.options.getString('role') || 'spectator';
    const nickname = trimChat(interaction.options.getString('nickname') || interaction.user?.username || 'SenseLink', 24) || 'SenseLink';

    // If a live feed for the same code is already in this channel, detach
    // it so the new one becomes the single source of truth.
    _detachRoomFeedForChannel(channelId, code);

    await interaction.deferReply();
    const sock = getRoomSocket(code, { nickname });
    sock.joinRoom(code, { nickname, role });
    // Wait for JOINED so the embed title can show that we are connected,
    // and so the first forwarded message lands in a joined room.
    if (!sock.connected || !sock.room || sock.room.code !== code) {
      await new Promise((resolve) => {
        let done = false;
        const finish = () => { if (done) return; done = true; off(); resolve(); };
        const off = sock.on((t) => {
          if (t === 'JOINED' && sock.room?.code === code) finish();
          else if (t === 'JOIN_REJECTED' || t === 'ROOM_CLOSED') finish();
        });
        setTimeout(finish, 4000);
      });
    }
    const embed = chatEmbed({
      kind: 'room',
      code,
      messages: [],
      title: `🎮 Room ${code}`,
    });
    const rows = _roomFeedRows('0', code);
    const reply = await interaction.editReply({ embeds: [embed], components: rows, fetchReply: true });
    const entry = {
      messageId: reply.id,
      code,
      messages: [],
      detach: null,
      channelId,
      authorId: interaction.user?.id || null,
      authorName: nickname,
      interaction: { ...interaction, message: reply },
    };
    _roomFeeds.set(reply.id, entry);
    _roomSessions.set(channelId + ':' + code, { entry, messageId: reply.id, code });
    _wireRoomSocketFanout(code);
    entry.detach = () => {};
    return reply;
  },
};
commands.push(_roomCmd);

