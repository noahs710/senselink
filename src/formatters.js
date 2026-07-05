import { EmbedBuilder } from 'discord.js';

export function profileEmbed(user, stats, achievements = []) {
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

  const latestAchievements = (achievements ?? [])
    .filter((a) => a.isVisible !== false)
    .slice(0, 5)
    .map((a) => `• ${a.title}`)
    .join('\n') || 'None yet';
  fields.push({ name: 'Recent achievements', value: latestAchievements });

  return new EmbedBuilder()
    .setTitle(`${user.displayName} (@${user.handle})`)
    .setURL(profileUrl(user.handle))
    .setDescription(user.bio || 'PeakSense profile')
    .setColor(0x22c55e)
    .setThumbnail(user.avatarUrl || null)
    .addFields(fields)
    .setFooter({ text: 'PeakSense • /profile' })
    .setTimestamp();
}

export function dabEmbed(dab, likes = null) {
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

  return new EmbedBuilder()
    .setTitle(u ? `${u.displayName} scored ${dab.score} (${dab.grade})` : `Dab ${dab.id.slice(0, 8)}`)
    .setURL(dabUrl(dab.id))
    .setDescription(`${u ? `@${u.handle}` : 'Someone'}'s dab — ${temp}°F, ${dur}s.`)
    .setColor(gradeColor(dab.grade))
    .setThumbnail(u?.avatarUrl || null)
    .addFields(fields)
    .setFooter({ text: `PeakSense • ${new Date(dab.createdAt).toLocaleString()}` })
    .setTimestamp();
}

export function leaderboardEmbed(entries, period) {
  const lines = (entries ?? []).slice(0, 10).map((e, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    return `${medal} **@${e.user.handle}** — rating ${Math.round(e.rating)} • best ${e.bestScore} • ${e.publicDabs} public`;
  });

  return new EmbedBuilder()
    .setTitle(`🏆 PeakSense leaderboard — ${period}`)
    .setDescription(lines.join('\n') || 'No rankings yet.')
    .setColor(0x22c55e)
    .setFooter({ text: 'SenseLink • /leaderboard' })
    .setTimestamp();
}

export function feedEmbed(items) {
  const lines = (items ?? []).slice(0, 10).map((d) => {
    const u = d.user;
    const dab = d.dab ?? d;
    return `• **@${u?.handle ?? 'unknown'}** scored **${dab.score}** (${dab.grade}) — [view](${dabUrl(dab.id)})`;
  });

  return new EmbedBuilder()
    .setTitle('🆕 Recent public dabs')
    .setDescription(lines.join('\n') || 'No public dabs yet.')
    .setColor(0x22c55e)
    .setFooter({ text: 'SenseLink • /feed' })
    .setTimestamp();
}

export function profileUrl(handle) {
  const base = (process.env.PEAKSENSE_API_BASE || 'http://127.0.0.1:8081').replace(/\/$/, '');
  return `${base}/u/${encodeURIComponent(handle)}`;
}

export function dabUrl(id) {
  const base = (process.env.PEAKSENSE_API_BASE || 'http://127.0.0.1:8081').replace(/\/$/, '');
  return `${base}/dab/${encodeURIComponent(id)}`;
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
