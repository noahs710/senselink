import { EmbedBuilder } from 'discord.js';

const PERIOD_LABELS = {
  all: 'All time',
  month: 'This month',
  week: 'This week',
  recent: 'Recent',
  trending: 'Trending',
};

function periodLabel(period) {
  return PERIOD_LABELS[period] || period;
}

function base() {
  return (process.env.PEAKSENSE_API_BASE || 'http://127.0.0.1:8081').replace(/\/$/, '');
}

export function profileUrl(handle) {
  return `${base()}/u/${encodeURIComponent(handle)}`;
}

export function dabUrl(id) {
  return `${base()}/dab/${encodeURIComponent(id)}`;
}

export function siteUrl() {
  return `${base()}/`;
}

export function leaderboardUrl() {
  return `${base()}/`;
}

/**
 * Resolve a single achievement to a displayable title. Prefers a real
 * title on the achievement object; falls back to the catalog by key;
 * returns null when nothing usable is available (so callers can drop
 * "undefined" entries instead of rendering them).
 */
export function resolveAchievementTitle(a, catalog = null) {
  if (!a) return null;
  const raw = a.title;
  if (typeof raw === 'string' && raw.trim() && raw !== 'undefined') return raw;
  const key = a.key != null ? String(a.key) : null;
  if (key && catalog?.has(key)) {
    const t = catalog.get(key).title;
    if (typeof t === 'string' && t.trim() && t !== 'undefined') return t;
  }
  // Last resort: the achievement key is a real identifier, so surface
  // it rather than emitting "undefined" or hiding a real achievement.
  return key || null;
}

/**
 * Build the "Recent achievements" bullet list for an embed. Filters out
 * anything that resolves to no title (never emits "undefined") and
 * returns 'No achievements yet' when the user has none.
 */
export function formatAchievementsList(achievements = [], catalog = null) {
  const titles = (achievements ?? [])
    .filter((a) => a && a.isPublic !== false)
    .map((a) => resolveAchievementTitle(a, catalog))
    .filter((t) => t)
    .slice(0, 5);
  if (!titles.length) return 'No achievements yet';
  return titles.map((t) => `• ${t}`).join('\n');
}

/**
 * Full achievement list for the /profile achievements view. Resolves
 * title + description (preferring the object, then the catalog by key)
 * and never emits "undefined". Returns 'No achievements yet.' when the
 * user has no public achievements.
 */
export function formatAchievementsFull(achievements = [], catalog = null) {
  const rows = (achievements ?? [])
    .filter((a) => a && a.isPublic !== false)
    .map((a) => {
      const title = resolveAchievementTitle(a, catalog);
      if (!title) return null;
      const key = a.key != null ? String(a.key) : null;
      let desc = a.description;
      if (!(typeof desc === 'string' && desc.trim() && desc !== 'undefined') && key && catalog?.has(key)) {
        desc = catalog.get(key).description;
      }
      if (!(typeof desc === 'string' && desc.trim() && desc !== 'undefined')) desc = null;
      return desc ? `**${title}** — ${desc}` : `**${title}**`;
    })
    .filter((r) => r);
  if (!rows.length) return 'No achievements yet.';
  return rows.join('\n');
}

export function profileEmbed(user, stats, achievements = [], catalog = null, imageUrl = null) {
  const fields = [];
  if (stats) {
    fields.push(
      { name: 'Dabs', value: String(stats.totalDabs ?? 0), inline: true },
      { name: 'Public', value: String(stats.publicDabs ?? 0), inline: true },
      { name: 'Best', value: String(stats.bestScore ?? 0), inline: true },
    );
    if (stats.averageScore != null) {
      fields.push({ name: 'Average', value: String(stats.averageScore), inline: true });
    }
    if (stats.rating) {
      fields.push({ name: 'Rating', value: String(Math.round(stats.rating)), inline: true });
    }
    if (stats.rank) {
      fields.push({ name: 'Rank', value: `#${stats.rank}`, inline: true });
    }
  }

  fields.push({ name: 'Recent achievements', value: formatAchievementsList(achievements, catalog) });

  const embed = new EmbedBuilder()
    .setTitle(`${user.displayName} (@${user.handle})`)
    .setURL(profileUrl(user.handle))
    .setDescription(user.bio || 'PeakSense profile')
    .setColor(0x22c55e)
    .addFields(fields)
    .setFooter({ text: 'PeakSense • /profile' })
    .setTimestamp();

  if (imageUrl) embed.setImage(imageUrl);
  if (user.avatarUrl) embed.setThumbnail(user.avatarUrl);
  return embed;
}

export function dabEmbed(dab, likes = null, imageUrl = null) {
  const u = dab.user;
  const dur = Math.round(dab.durationS ?? 0);
  const temp = Math.round(dab.tempF ?? 0);
  const fields = [
    { name: 'Score', value: `${dab.score}/100 (${dab.grade})`, inline: true },
    { name: 'Temp', value: `${temp}°F`, inline: true },
    { name: 'Duration', value: `${dur}s`, inline: true },
  ];
  if (likes != null) {
    fields.push({ name: 'Likes', value: String(likes.count ?? 0), inline: true });
  }

  const embed = new EmbedBuilder()
    .setTitle(u ? `${u.displayName} scored ${dab.score} (${dab.grade})` : `Dab ${String(dab.id).slice(0, 8)}`)
    .setURL(dabUrl(dab.id))
    .setDescription(`${u ? `@${u.handle}` : 'Someone'}'s dab — ${temp}°F, ${dur}s.`)
    .setColor(gradeColor(dab.grade))
    .addFields(fields)
    .setFooter({ text: `PeakSense • ${new Date(dab.createdAt).toLocaleString()}` })
    .setTimestamp();

  if (imageUrl) embed.setImage(imageUrl);
  if (u?.avatarUrl) embed.setThumbnail(u.avatarUrl);
  return embed;
}

export function leaderboardEmbed(entries, period, pageIndex = 0) {
  const lines = (entries ?? []).map((e, i) => {
    const rank = e?.rank ?? i + 1;
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
    const delta = e.periodDelta != null ? ` *(+${Math.round(e.periodDelta)})` : '';
    return `${medal} **@${e.user.handle}** — rating ${Math.round(e.rating)} • best ${e.bestScore} • ${e.publicDabs} public${delta}`;
  });

  return new EmbedBuilder()
    .setTitle(`🏆 PeakSense leaderboard — ${periodLabel(period)}`)
    .setDescription(lines.join('\n') || 'No rankings yet.')
    .setColor(0x22c55e)
    .setFooter({ text: `Page ${pageIndex + 1} • SenseLink • /leaderboard` })
    .setTimestamp();
}

export function feedEmbed(items, period, pageIndex = 0) {
  const icon = period === 'trending' ? '🔥' : '🆕';
  const lines = (items ?? []).map((d) => {
    const u = d.user;
    const dab = d.dab ?? d;
    const temp = Math.round(dab.tempF ?? 0);
    const dur = Math.round(dab.durationS ?? 0);
    return `• **@${u?.handle ?? 'unknown'}** scored **${dab.score}** (${dab.grade}) — ${temp}°F, ${dur}s — [view](${dabUrl(dab.id)})`;
  });

  return new EmbedBuilder()
    .setTitle(`${icon} ${periodLabel(period)} public dabs`)
    .setDescription(lines.join('\n') || 'No public dabs yet.')
    .setColor(0x22c55e)
    .setFooter({ text: `Page ${pageIndex + 1} • SenseLink • /feed` })
    .setTimestamp();
}

export function dabsListEmbed(handle, dabs, pageIndex = 0) {
  const lines = (dabs ?? []).map((d) =>
    `• **${d.score}** (${d.grade}) — ${Math.round(d.tempF ?? 0)}°F, ${Math.round(d.durationS ?? 0)}s — [view](${dabUrl(d.id)})`,
  );
  return new EmbedBuilder()
    .setTitle(`Recent dabs — @${handle}`)
    .setDescription(lines.join('\n') || 'No public dabs found.')
    .setColor(0x22c55e)
    .setFooter({ text: `Page ${pageIndex + 1} • SenseLink • /dabs` })
    .setTimestamp();
}


/**
 * Relative time prefix for chat lines.  Returns "· just now" for
 * <60s, "· 2m ago" for minutes, "· 1h ago" for hours.  Returns ''
 * when the timestamp is missing or invalid.
 */
function relativeTime(ms) {
  if (!ms || typeof ms !== 'number') return '';
  const diff = Date.now() - ms;
  if (diff < 0 || diff > 24 * 60 * 60 * 1000) return '';
  if (diff < 60_000) return ' · just now';
  const m = Math.floor(diff / 60_000);
  if (m < 60) return ` · ${m}m ago`;
  const h = Math.floor(m / 60);
  return ` · ${h}h ago`;
}

/**
 * Format a single chat message for the "most recent N" view inside
 * the live chat embeds.  When a profile map is supplied and the
 * message has a real handle, the author becomes a clickable markdown
 * link: [DisplayName](profileUrl).  Guest lines (no handle) render
 * as plain bold.  Truncates body to fit; adds ⚠ for failed sends and
 * a relative-time suffix.
 */
function formatChatLine(msg, maxLen = 80, profiles = null) {
  if (!msg) return '';
  const handle = msg.handle || null;
  const profile = (handle && profiles?.get(handle)) || null;
  const who = msg.displayName || msg.nickname || (handle ? '@' + handle : 'Guest');
  const whoSafe = String(who).replace(/\s+/g, ' ').trim().slice(0, 32) || 'Guest';
  const text = String(msg.text ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';

  // Clickable profile link for site users, plain bold for guests.
  const author = profile?.profileUrl
    ? `[${whoSafe}](${profile.profileUrl})`
    : `**${whoSafe}**`;

  const warn = msg._failed ? '⚠ ' : '';
  const ts = relativeTime(msg._failed ? undefined : msg.createdAt);
  const truncated = text.length > maxLen ? text.slice(0, maxLen - 1) + '…' : text;
  return `${warn}${author} — ${truncated}${ts}`;
}

/**
 * Build a chat embed (site chat or room chat). `kind` is "site" or
 * "room"; `code` is the room code when kind==="room". `messages` is
 * the array to render (newest last so the embed reads top-to-bottom
 * chronologically).  `profiles` is an optional Map<handle, {profile}>
 * used to render clickable author links.  `author` is an optional
 * resolved profile for the embed setAuthor header.
 */
export function chatEmbed({ kind, code = null, messages = [], title = null, pageIndex = 0, totalPages = 1, profiles = null, author = null, footerText = null }) {
  const isSite = kind === 'site';
  const list = Array.isArray(messages) ? messages : [];
  const lines = list.map((m) => formatChatLine(m, isSite ? 90 : 80, profiles)).filter(Boolean);
  const body = lines.join('\n') || (isSite ? 'No one has said anything yet. Break the ice?' : 'Room is quiet. Send the first message.');

  const embed = new EmbedBuilder()
    .setColor(isSite ? 0x22c55e : 0x38bdf8)
    .setDescription(body.slice(0, 4000))
    .setTimestamp();

  if (title) {
    embed.setTitle(title);
  } else if (isSite) {
    embed.setTitle('🌐 Site chat');
  } else {
    embed.setTitle(`🎮 Room ${code}`);
  }

  if (author?.profileUrl) {
    embed.setAuthor({ name: author.displayName || author.handle, url: author.profileUrl, ...(author.avatarUrl ? { iconURL: author.avatarUrl } : {}) });
  }

  const footerParts = ['SenseLink', isSite ? '/chat' : '/room'];
  if (footerText) footerParts.push(footerText);
  if (totalPages > 1) footerParts.push(`Page ${pageIndex + 1}/${totalPages}`);
  embed.setFooter({ text: footerParts.join(' • ') });

  return embed;
}


function gradeColor(grade) {
  switch (grade) {
    case 'SS': return 0xffd700;
    case 'S': return 0xffa500;
    case 'A': return 0x22c55e;
    case 'B': return 0x3b82f6;
    case 'C': return 0xa855f7;
    case 'D': return 0xf97316;
    case 'F': return 0xef4444;
    default: return 0x94a3b8;
  }
}