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

/**
 * Build a text-based XP progress bar.
 * Returns a string like `[████████░░░░░░░░] 400/500 XP` (10 blocks wide).
 */
function xpBar(xp, xpNeeded) {
  const width = 10;
  const filled = xpNeeded > 0 ? Math.round((xp / xpNeeded) * width) : 0;
  const bar = '█'.repeat(Math.min(filled, width)) + '░'.repeat(Math.max(width - filled, 0));
  return `[${bar}] ${xp}/${xpNeeded} XP`;
}

export function profileEmbed(user, stats, achievements = [], catalog = null, imageUrl = null, followStats = null) {
  const fields = [];

  // Progression: level, XP bar, title, streak
  const level = user.level || stats?.level || 1;
  const xp = user.xp ?? stats?.xp ?? 0;
  const xpNeeded = stats?.xpNeeded ?? (100 * level);
  const title = stats?.title || '';
  const streak = user.streak ?? stats?.streak ?? 0;
  const bestStreak = user.bestStreak ?? stats?.bestStreak ?? 0;
  const totalXp = user.totalXp ?? stats?.totalXp ?? 0;

  if (title) {
    fields.push({ name: 'Level', value: `${level} · ${title}`, inline: true });
  } else {
    fields.push({ name: 'Level', value: String(level), inline: true });
  }
  fields.push({ name: 'XP', value: xpBar(xp, xpNeeded), inline: true });
  if (streak > 0 || bestStreak > 0) {
    fields.push({ name: 'Streak', value: `🔥 ${streak} (best: ${bestStreak})`, inline: true });
  }

  // Core stats
  if (stats) {
    fields.push(
      { name: 'Dabs', value: String(stats.totalDabs ?? 0), inline: true },
      { name: 'Public', value: String(stats.publicDabs ?? 0), inline: true },
      { name: 'Best', value: String(stats.bestScore ?? 0), inline: true },
    );
    if (stats.averageScore != null) {
      fields.push({ name: 'Average', value: String(stats.averageScore), inline: true });
    }
    if (stats.dabsPerDay != null && stats.dabsPerDay > 0) {
      fields.push({ name: 'Dabs/day', value: String(stats.dabsPerDay), inline: true });
    }
    if (stats.rating) {
      fields.push({ name: 'Rating', value: String(Math.round(stats.rating)), inline: true });
    }
    if (stats.rank) {
      fields.push({ name: 'Rank', value: `#${stats.rank}`, inline: true });
    }
  }

  // Follow stats
  if (followStats) {
    fields.push(
      { name: 'Followers', value: String(followStats.followers ?? 0), inline: true },
      { name: 'Following', value: String(followStats.following ?? 0), inline: true },
    );
  }

  fields.push({ name: 'Recent achievements', value: formatAchievementsList(achievements, catalog) });

  // Build a rich description with bio + total XP
  const descParts = [];
  if (user.bio) descParts.push(user.bio);
  if (totalXp > 0) descParts.push(`Lifetime XP: **${totalXp}**`);
  const description = descParts.length > 0 ? descParts.join('\n') : 'PeakSense profile';

  const embed = new EmbedBuilder()
    .setTitle(`${user.displayName} (@${user.handle})`)
    .setURL(profileUrl(user.handle))
    .setDescription(description.slice(0, 4000))
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
  const perfect = dab.isPerfectDraw ? ' ⭐' : '';
  const fields = [
    { name: `Score${perfect}`, value: `${dab.score}/100 (${dab.grade})`, inline: true },
    { name: 'Temp', value: `${temp}°F`, inline: true },
    { name: 'Duration', value: `${dur}s`, inline: true },
  ];
  if (likes != null) {
    fields.push({ name: 'Likes', value: String(likes.count ?? 0), inline: true });
  }

  const embed = new EmbedBuilder()
    .setTitle(u ? `${u.displayName} scored ${dab.score} (${dab.grade})${perfect}` : `Dab ${String(dab.id).slice(0, 8)}`)
    .setURL(dabUrl(dab.id))
    .setDescription(`${u ? `[@${u.handle}](${profileUrl(u.handle)})` : 'Someone'}'s dab — ${temp}°F, ${dur}s.${perfect ? ' **Perfect draw!**' : ''}`)
    .setColor(gradeColor(dab.grade))
    .addFields(fields)
    .setFooter({ text: `PeakSense • ${new Date(dab.createdAt).toLocaleString()}` })
    .setTimestamp();

  if (imageUrl) embed.setImage(imageUrl);
  if (u?.avatarUrl) embed.setThumbnail(u.avatarUrl);
  return embed;
}

export function leaderboardEmbed(entries, period, pageIndex = 0, youInfo = null) {
  const lines = (entries ?? []).map((e, i) => {
    const rank = e?.rank ?? i + 1;
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
    const delta = e.periodDelta != null ? ` *(+${Math.round(e.periodDelta)})` : '';
    const level = e.user?.level ? ` L${e.user.level}` : '';
    const title = e.user?.level ? ` ${titleForLevelShort(e.user.level)}` : '';
    return `${medal} **@${e.user.handle}**${level ? ` (${level}${title})` : ''} — rating ${Math.round(e.rating)} • best ${e.bestScore} • ${e.publicDabs} public${delta}`;
  });

  const footerParts = [`Page ${pageIndex + 1}`, 'SenseLink', '/leaderboard'];
  if (youInfo?.rank) footerParts.push(`You: #${youInfo.rank}`);
  return new EmbedBuilder()
    .setTitle(`🏆 PeakSense leaderboard — ${periodLabel(period)}`)
    .setDescription(lines.join('\n') || 'No rankings yet.')
    .setColor(0x22c55e)
    .setFooter({ text: footerParts.join(' • ') })
    .setTimestamp();
}

/** Short title for leaderboard compactness */
function titleForLevelShort(level) {
  const titles = [
    [100, 'Legend'], [90, 'Vapor'], [80, 'Cloud'], [70, 'Titan'],
    [60, 'Maestro'], [50, 'Savant'], [40, 'Connoisseur'], [30, 'Pro'],
    [25, 'Star'], [20, 'Chaser'], [15, 'Seeker'], [10, 'Enthusiast'],
    [5, 'Apprentice'], [0, 'New'],
  ];
  for (const [min, t] of titles) if (level >= min) return t;
  return '';
}

export function statsEmbed(user, stats, followStats = null) {
  const level = user.level || stats?.level || 1;
  const xp = user.xp ?? stats?.xp ?? 0;
  const xpNeeded = stats?.xpNeeded ?? (100 * level);
  const title = stats?.title || '';
  const streak = user.streak ?? stats?.streak ?? 0;
  const bestStreak = user.bestStreak ?? stats?.bestStreak ?? 0;
  const totalXp = user.totalXp ?? stats?.totalXp ?? 0;

  const fields = [
    { name: 'Level', value: `${level}${title ? ' · ' + title : ''}`, inline: true },
    { name: 'XP (this level)', value: `${xp} / ${xpNeeded}`, inline: true },
    { name: 'Lifetime XP', value: String(totalXp), inline: true },
    { name: 'Current Streak', value: `🔥 ${streak}`, inline: true },
    { name: 'Best Streak', value: String(bestStreak), inline: true },
    { name: 'Rating', value: String(Math.round(stats?.rating ?? user.rating ?? 0)), inline: true },
    { name: 'Best Score', value: String(stats?.bestScore ?? user.bestScore ?? 0), inline: true },
    { name: 'Average Score', value: stats?.averageScore != null ? String(stats.averageScore) : '—', inline: true },
    { name: 'Total Dabs', value: String(stats?.totalDabs ?? user.totalDabs ?? 0), inline: true },
    { name: 'Public Dabs', value: String(stats?.publicDabs ?? 0), inline: true },
    { name: 'Dabs/Day', value: String(stats?.dabsPerDay ?? 0), inline: true },
  ];

  if (followStats) {
    fields.push(
      { name: 'Followers', value: String(followStats.followers ?? 0), inline: true },
      { name: 'Following', value: String(followStats.following ?? 0), inline: true },
    );
  }

  return new EmbedBuilder()
    .setTitle(`📊 Stats — ${user.displayName} (@${user.handle})`)
    .setURL(profileUrl(user.handle))
    .setDescription(xpBar(xp, xpNeeded))
    .setColor(0x22c55e)
    .addFields(fields)
    .setFooter({ text: 'PeakSense • /stats' })
    .setTimestamp();
}

export function feedEmbed(items, period, pageIndex = 0) {
  const icon = period === 'trending' ? '🔥' : '🆕';
  const lines = (items ?? []).map((d) => {
    const u = d.user;
    const dab = d.dab ?? d;
    const temp = Math.round(dab.tempF ?? 0);
    const dur = Math.round(dab.durationS ?? 0);
    const who = u?.handle ? `[@${u.displayName ?? u.handle}](${profileUrl(u.handle)})` : `**${u?.displayName ?? 'unknown'}**`;
    const perfect = dab.isPerfectDraw ? ' ⭐' : '';
    return `• ${who} scored **${dab.score}** (${dab.grade})${perfect} — ${temp}°F, ${dur}s — [view](${dabUrl(dab.id)})`;
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

  // Clickable profile link for any message with a handle — even if
  // the full profile hasn't resolved yet, we can construct the URL
  // from the handle.  Guests (no handle) render as plain bold.
  const baseUrl = (process.env.PEAKSENSE_API_BASE || 'http://127.0.0.1:8081').replace(/\/$/, '');
  const profileUrl = profile?.profileUrl || (handle ? `${baseUrl}/u/${encodeURIComponent(handle)}` : null);
  const author = profileUrl
    ? `[${whoSafe}](${profileUrl})`
    : `**${whoSafe}**`;

  const warn = msg._failed ? '⚠ ' : '';
  const replyChip = msg.replyTo ? '↪ reply · ' : '';
  const ts = relativeTime(msg._failed ? undefined : msg.createdAt);
  const truncated = text.length > maxLen ? text.slice(0, maxLen - 1) + '…' : text;
  return `${warn}${author} — ${replyChip}${truncated}${ts}`;
}

export const CHAT_PAGE_SIZE = 10;

/**
 * Build a chat embed (site chat or room chat). `kind` is "site" or
 * "room"; `code` is the room code when kind==="room". `messages` is the
 * full array (newest last, oldest-first chronological).  `pageIndex`
 * selects which 6-line window to show in the description; older lines
 * are summarized in an "Earlier messages" embed field grouped in
 * 1-minute windows.  `profiles` is an optional Map<handle, {profile}>.
 * `author` is an optional resolved profile for the embed setAuthor.
 */
export function chatEmbed({ kind, code = null, messages = [], title = null, pageIndex = 0, totalPages = 1, profiles = null, author = null, footerText = null, presence = null, typing = null }) {
  const isSite = kind === 'site';
  const list = Array.isArray(messages) ? messages : [];
  totalPages = Math.max(1, totalPages);
  pageIndex = Math.max(0, Math.min(pageIndex, totalPages - 1));

  // Determine which slice of messages to show in the description.
  // The last page (newest) is pageIndex = totalPages - 1.  We show
  // CHAT_PAGE_SIZE lines per page from the end of the list.
  const totalLines = list.length;
  const endIdx = totalLines - (totalPages - 1 - pageIndex) * CHAT_PAGE_SIZE;
  const startIdx = Math.max(0, endIdx - CHAT_PAGE_SIZE);
  const pageMessages = list.slice(startIdx, endIdx);

  const lines = pageMessages.map((m) => formatChatLine(m, isSite ? 90 : 80, profiles)).filter(Boolean);
  let body = lines.join('\n') || (isSite ? 'No one has said anything yet. Break the ice?' : 'Room is quiet. Send the first message.');
  // Typing indicator: append a transient line at the bottom.
  if (typing) {
    body += '\n' + typing + ' is typing…';
  }

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

  // "Earlier messages" field: group older messages (those before the
  // current page's start) in 1-minute windows with a count.  Only show
  // when we're on the first page (oldest) so the field summarises
  // everything before the current view.
  if (startIdx > 0) {
    const older = list.slice(0, startIdx);
    const groups = {};
    for (const m of older) {
      const ts = m.createdAt || m._localSeq * 1000 || 0;
      const d = new Date(ts);
      if (isNaN(d.getTime())) continue;
      const key = d.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
      groups[key] = (groups[key] || 0) + 1;
    }
    const groupLines = Object.entries(groups)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, n]) => `${k.replace('T', ' ')} — ${n} message${n === 1 ? '' : 's'}`);
    if (groupLines.length > 0) {
      embed.addFields({ name: 'Earlier messages', value: groupLines.join('\n').slice(0, 1024) });
    }
  }

  // Room presence fields: show player and spectator counts.
  if (!isSite && presence && (presence.players != null || presence.spectators != null)) {
    embed.addFields(
      { name: 'Players', value: String(presence.players ?? 0), inline: true },
      { name: 'Spectators', value: String(presence.spectators ?? 0), inline: true },
    );
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

// ---------------------------------------------------------------------------
// Deep integration formatters (battles, digest, dotd, announcements)
// ---------------------------------------------------------------------------

/**
 * Format the list of open public battle groups into an embed.
 * `groups` is the array from GET /api/groups. Each item may have
 * { id, name, memberCount, seshState, hostName }.
 */
export function battlesEmbed(groups) {
  const list = Array.isArray(groups) ? groups : [];
  const open = list.filter((g) => !g.seshState || g.seshState === 'open' || g.seshState === 'lobby');
  const lines = (open.length > 0 ? open : list).slice(0, 25).map((g, i) => {
    const name = g.name || `Room ${g.id || i + 1}`;
    const members = g.memberCount != null ? g.memberCount : (g.members ? g.members.length : 0);
    const state = g.seshState || 'open';
    const stateIcon = state === 'in_progress' || state === 'active' ? '🔴' : '🟢';
    const host = g.hostName ? ` · host: ${g.hostName}` : '';
    return `${stateIcon} **${name}** — ${members} member${members === 1 ? '' : 's'} · ${state}${host}`;
  });
  return new EmbedBuilder()
    .setTitle('⚔️ Open Battle Rooms')
    .setDescription(lines.join('\n') || 'No public battle rooms open right now.')
    .setColor(0xf97316)
    .setFooter({ text: 'SenseLink • /battles' })
    .setTimestamp();
}

/**
 * Format the weekly community digest into an embed. `stats` is the
 * response from GET /api/community/weekly, expected to have
 * { totalDabs, averageScore, topDabber, mostActive, ... }.
 */
export function digestEmbed(stats) {
  if (!stats) {
    return new EmbedBuilder()
      .setTitle('📊 Weekly Community Digest')
      .setDescription('Community stats are not available right now. The /api/community/weekly endpoint may not be deployed yet.')
      .setColor(0xef4444)
      .setFooter({ text: 'SenseLink • /digest' })
      .setTimestamp();
  }
  const fields = [
    { name: 'Total Dabs', value: String(stats.totalDabs ?? 0), inline: true },
    { name: 'Avg Score', value: stats.averageScore != null ? String(Math.round(stats.averageScore)) : '—', inline: true },
  ];
  if (stats.topDabber) {
    const td = stats.topDabber;
    const handle = td.handle || td;
    const label = td.displayName ? `${td.displayName} (@${handle})` : `@${handle}`;
    fields.push({ name: 'Top Dabber', value: label, inline: true });
  }
  if (stats.mostActive) {
    const ma = stats.mostActive;
    const handle = ma.handle || ma;
    const label = ma.displayName ? `${ma.displayName} (@${handle})` : `@${handle}`;
    fields.push({ name: 'Most Active', value: label, inline: true });
  }
  if (stats.newUsers != null) {
    fields.push({ name: 'New Users', value: String(stats.newUsers), inline: true });
  }
  if (stats.totalPerfectDraws != null) {
    fields.push({ name: 'Perfect Draws', value: String(stats.totalPerfectDraws), inline: true });
  }
  return new EmbedBuilder()
    .setTitle('📊 Weekly Community Digest')
    .setDescription('The latest community stats from PeakSense.')
    .setColor(0x22c55e)
    .addFields(fields)
    .setFooter({ text: 'SenseLink • /digest' })
    .setTimestamp();
}

/**
 * Format the Dab of the Day into an embed. `data` is the response
 * from GET /api/dabs/dotd, expected to have { dab, user, score, tempF,
 * durationS, grade, createdAt, id }.
 */
export function dotdEmbed(data) {
  if (!data || (!data.dab && !data.id)) {
    return new EmbedBuilder()
      .setTitle('🏆 Dab of the Day')
      .setDescription('No Dab of the Day has been picked yet today. Check back later!')
      .setColor(0x94a3b8)
      .setFooter({ text: 'SenseLink • /dotd' })
      .setTimestamp();
  }
  const dab = data.dab || data;
  const u = dab.user || data.user;
  const score = dab.score ?? data.score ?? 0;
  const grade = dab.grade || data.grade || '';
  const temp = Math.round(dab.tempF ?? data.tempF ?? 0);
  const dur = Math.round(dab.durationS ?? data.durationS ?? 0);
  const id = dab.id ?? data.id;
  const perfect = (dab.isPerfectDraw ?? data.isPerfectDraw) ? ' ⭐ **Perfect draw!**' : '';
  const fields = [
    { name: `Score${perfect ? '' : ''}`, value: `${score}/100 (${grade})`, inline: true },
    { name: 'Temp', value: `${temp}°F`, inline: true },
    { name: 'Duration', value: `${dur}s`, inline: true },
  ];
  const embed = new EmbedBuilder()
    .setTitle(`🏆 Dab of the Day${perfect}`)
    .setURL(dabUrl(id))
    .setDescription(
      (u ? `[@${u.handle}](${profileUrl(u.handle)})` : 'Someone') +
      ` scored **${score}** (${grade}) — ${temp}°F, ${dur}s.${perfect}`,
    )
    .setColor(0xffd700)
    .addFields(fields)
    .setFooter({ text: `SenseLink • /dotd • ${new Date(dab.createdAt ?? data.createdAt ?? Date.now()).toLocaleString()}` })
    .setTimestamp();
  if (u?.avatarUrl) embed.setThumbnail(u.avatarUrl);
  return embed;
}

/**
 * Format a live-feed dab post (used by /feedwatch when a new public
 * dab arrives). Returns an EmbedBuilder ready to send to a channel.
 */
export function liveFeedDabEmbed(dab) {
  if (!dab) return null;
  const u = dab.user;
  const temp = Math.round(dab.tempF ?? 0);
  const dur = Math.round(dab.durationS ?? 0);
  const perfect = dab.isPerfectDraw ? ' ⭐' : '';
  const embed = new EmbedBuilder()
    .setTitle(`🆕 ${u ? u.displayName : 'Someone'} just dabbed — ${dab.score} (${dab.grade})${perfect}`)
    .setURL(dabUrl(dab.id))
    .setDescription(
      (u ? `[@${u.handle}](${profileUrl(u.handle)})` : 'Someone') +
      ` scored **${dab.score}** (${dab.grade}) — ${temp}°F, ${dur}s.${perfect ? ' **Perfect draw!**' : ''}`,
    )
    .setColor(gradeColor(dab.grade))
    .setFooter({ text: 'SenseLink • Live Feed' })
    .setTimestamp(dab.createdAt ? new Date(dab.createdAt) : new Date());
  if (u?.avatarUrl) embed.setThumbnail(u.avatarUrl);
  return embed;
}

/**
 * Format an achievement-unlock announcement embed.
 * { handle, displayName, achievementTitle, achievementDescription, avatarUrl }
 */
export function achievementAnnouncementEmbed(info) {
  const handle = info?.handle || 'unknown';
  const name = info?.displayName || handle;
  const title = info?.achievementTitle || 'An Achievement';
  const desc = info?.achievementDescription || '';
  const embed = new EmbedBuilder()
    .setTitle(`🎖️ ${name} unlocked an achievement!`)
    .setDescription(`**${title}**${desc ? `\n${desc}` : ''}`)
    .setColor(0xffd700)
    .setURL(profileUrl(handle))
    .setFooter({ text: 'SenseLink • Achievement Alert' })
    .setTimestamp();
  if (info?.avatarUrl) embed.setThumbnail(info.avatarUrl);
  return embed;
}

/**
 * Format a rank-up (ELO tier boundary) announcement embed.
 * { handle, displayName, oldTier, newTier, newRating, avatarUrl }
 */
export function rankUpAnnouncementEmbed(info) {
  const handle = info?.handle || 'unknown';
  const name = info?.displayName || handle;
  const oldTier = info?.oldTier || '—';
  const newTier = info?.newTier || '—';
  const rating = info?.newRating != null ? Math.round(info.newRating) : '—';
  const embed = new EmbedBuilder()
    .setTitle(`📈 ${name} ranked up!`)
    .setDescription(`**${oldTier} → ${newTier}**\nNew rating: **${rating}**`)
    .setColor(0x22d3ee)
    .setURL(profileUrl(handle))
    .setFooter({ text: 'SenseLink • Rank-Up Alert' })
    .setTimestamp();
  if (info?.avatarUrl) embed.setThumbnail(info.avatarUrl);
  return embed;
}
