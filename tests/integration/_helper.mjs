import { randomUUID } from 'node:crypto';

/**
 * Minimal Discord interaction/message mock harness for integration tests.
 *
 * Key design decisions that mirror real discord.js behaviour:
 *
 *  - `editReply` always edits the SAME message (the one created by the
 *    initial deferReply), keeping a stable message id.  In discord.js,
 *    `interaction.editReply()` updates the original deferred reply; it
 *    does NOT create a new message.  Tests rely on this to poll a single
 *    message id for embed updates.
 *
 *  - `reply` and `followUp` create new messages with fresh ids.
 *
 *  - The returned message object exposes `.edits` (array of payloads
 *    passed to `editReply`) so tests can inspect the embed history.
 */
export function makeCommandHarness({ channelId = 'c1' } = {}) {
  const user = {
    id: 'tester-' + randomUUID().slice(0, 8),
    username: 'tester',
    globalName: 'Test User',
  };
  const messages = new Map();
  const sentReplies = [];
  const sentFollowUps = [];
  let nextId = 1;
  function newId() { return 'm' + (nextId++); }

  function makeInteraction(extra = {}) {
    let mainId = null;
    function getMain() {
      if (!mainId) {
        mainId = newId();
        const m = { id: mainId, edits: [], replies: [], followUps: [] };
        // In real discord.js, Message.edit() updates the same message
        // in-place.  The bot uses msg.edit() instead of interaction.editReply()
        // for ongoing embed updates because interaction tokens expire
        // after 15 minutes.  The mock mirrors this: edit() pushes to the
        // same .edits array as editReply().
        m.edit = async (payload) => { m.edits.push(payload); return m; };
        messages.set(mainId, m);
      }
      return messages.get(mainId);
    }
    const interaction = {
      user,
      channelId,
      options: {
        getSubcommand: () => 'join',
        getInteger: () => 25,
        getString: () => undefined,
      },
      deferred: false,
      replied: false,
      async deferReply() {
        this.deferred = true;
        const m = getMain();
        return m;
      },
      async editReply(payload) {
        const m = getMain();
        m.edits.push(payload);
        this.replied = true;
        return m;
      },
      async reply(payload) {
        const id = newId();
        const m = { id, edits: [payload], replies: [], followUps: [] };
        messages.set(id, m);
        this.replied = true;
        sentReplies.push({ id, payload });
        return m;
      },
      async followUp(payload) {
        const id = newId();
        const m = { id, edits: [payload], replies: [], followUps: [] };
        messages.set(id, m);
        sentFollowUps.push({ id, payload });
        return m;
      },
      ...extra,
    };
    return { interaction, messages };
  }
  return { makeInteraction, messages, sentReplies, sentFollowUps, user };
}

export function makeDiscordMessage({ channelId = 'c1', content = 'hello', authorId = 'du', authorName = 'Du' } = {}) {
  return {
    id: 'msg-' + randomUUID().slice(0, 8),
    channelId,
    content,
    author: { id: authorId, username: authorName, globalName: authorName, bot: false },
    guild: true,
  };
}

/**
 * Extract the description text from an embed payload.  In discord.js
 * v14, EmbedBuilder stores data in `.data`; the mock passes the builder
 * object through as-is so we need to look in `.data.description`.
 * Falls back to `.description` for plain-object embeds.
 */
export function embedDescription(edit) {
  const emb = edit?.embeds?.[0];
  if (!emb) return '';
  return emb.data?.description ?? emb.description ?? '';
}

/**
 * Extract all text from an embed (description + field values) so
 * tests can find text that was pushed off the visible page into an
 * "Earlier messages" field by pagination.
 */
export function embedText(edit) {
  const emb = edit?.embeds?.[0];
  if (!emb) return '';
  const d = emb.data ?? emb;
  let text = d.description ?? '';
  const fields = d.fields ?? [];
  for (const f of fields) {
    text += '\n' + (f.value ?? '');
  }
  return text;
}