import test from "node:test";
import assert from "node:assert/strict";
import { makeCommandHarness, makeDiscordMessage, embedDescription } from "./_helper.mjs";

process.env.PEAKSENSE_API_BASE = process.env.PEAKSENSE_API_BASE || "https://peaksense.fly.dev";

const mod = await import("file:///C:/Users/Gabrielle%20Monlea/Documents/Projects/senselink/src/commands/index.js");
const sockets = await import("file:///C:/Users/Gabrielle%20Monlea/Documents/Projects/senselink/src/peakSocket.js");
const chat = mod.default.find((c) => c.data.name === "chat");

test("dedupe: textwatcher pre-push + server echo = one line", async () => {
  const { makeInteraction, messages } = makeCommandHarness();
  const { interaction } = makeInteraction();
  await chat.execute(interaction);
  await new Promise((r) => setTimeout(r, 2000));
  const target = [...messages.keys()][0];
  assert.ok(target, "expected /chat join to produce a message");
  messages.get(target).edits.length = 0;

  const text = "dedupe-" + Date.now();
  const r = mod.forwardChannelMessage(makeDiscordMessage({ content: text, authorId: "du", authorName: "Du" }));
  assert.ok(r > 0, "textwatcher should report at least one forwarded feed");

  await new Promise((r) => setTimeout(r, 3000));
  const edits = messages.get(target)?.edits || [];
  const last = edits[edits.length - 1];
  const desc = embedDescription(last);
  const occurrences = desc.split(text).length - 1;
  sockets.closeSiteSocket();
  assert.equal(occurrences, 1, "text should appear exactly once, got " + occurrences + " in: " + desc);
});