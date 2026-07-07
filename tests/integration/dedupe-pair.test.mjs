import test from "node:test";
import assert from "node:assert/strict";
import { makeCommandHarness, makeDiscordMessage, embedText } from "./_helper.mjs";

process.env.PEAKSENSE_API_BASE = process.env.PEAKSENSE_API_BASE || "https://peaksense.fly.dev";

const mod = await import("file:///C:/Users/Gabrielle%20Monlea/Documents/Projects/senselink/src/commands/index.js");
const sockets = await import("file:///C:/Users/Gabrielle%20Monlea/Documents/Projects/senselink/src/peakSocket.js");
const chat = mod.default.find((c) => c.data.name === "chat");

test("dedupe: two identical messages 100ms apart produce two lines", async () => {
  const { makeInteraction, messages } = makeCommandHarness();
  const { interaction } = makeInteraction({
    options: { getSubcommand: () => "join", getInteger: () => 1, getString: () => undefined },
  });
  await chat.execute(interaction);
  await new Promise((r) => setTimeout(r, 2000));
  const target = [...messages.keys()][0];
  assert.ok(target, "expected /chat join to produce a message");
  messages.get(target).edits.length = 0;

  const text = "dupe-pair-" + Date.now();
  mod.forwardChannelMessage(makeDiscordMessage({ content: text, authorId: "du1", authorName: "Du" }));
  await new Promise((r) => setTimeout(r, 100));
  mod.forwardChannelMessage(makeDiscordMessage({ content: text, authorId: "du2", authorName: "Du" }));

  await new Promise((r) => setTimeout(r, 4000));

  const edits = messages.get(target)?.edits || [];
  let maxOccurrences = 0;
  let bestDesc = "";
  for (const e of edits) {
    const desc = embedText(e);
    const n = desc.split(text).length - 1;
    if (n > maxOccurrences) { maxOccurrences = n; bestDesc = desc; }
  }
  sockets.closeSiteSocket();
  assert.equal(maxOccurrences, 2, "text should appear exactly twice in at least one edit, got max " + maxOccurrences + " in: " + bestDesc);
});