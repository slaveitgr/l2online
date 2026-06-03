#!/usr/bin/env node
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const NORMALIZED_DIR = join(ROOT, ".l2system-index", "normalized");
const OUT_DIR = join(ROOT, ".l2system-index", "lookups");

async function readJson(path, fallback = []) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

function cleanText(text) {
  return text.replace(/\\n/g, "\n").replace(/\s+/g, " ").trim();
}

function buildIdMap(entries, options = {}) {
  const out = {};
  for (const e of entries) {
    if (typeof e.id !== "number" || e.id <= 0) continue;
    if (options.minId && e.id < options.minId) continue;
    if (options.maxId && e.id > options.maxId) continue;
    const text = cleanText(e.text);
    if (!text) continue;
    out[e.id] ??= [];
    if (!out[e.id].includes(text)) out[e.id].push(text);
  }
  return out;
}

function firstValueMap(multimap) {
  return Object.fromEntries(Object.entries(multimap).map(([id, values]) => [id, values[0]]));
}

function sequentialTextMap(entries, sourceIncludes) {
  const filtered = entries
    .filter((e) => e.source?.toLowerCase().includes(sourceIncludes))
    .filter((e) => cleanText(e.text).length > 0)
    .sort((a, b) => a.offset - b.offset);
  return Object.fromEntries(filtered.map((e, i) => [String(i + 1), cleanText(e.text)]));
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const families = {
    npcNames: await readJson(join(NORMALIZED_DIR, "npc-names.json")),
    itemNames: await readJson(join(NORMALIZED_DIR, "item-names.json")),
    skillNames: await readJson(join(NORMALIZED_DIR, "skill-names.json")),
    systemMessages: await readJson(join(NORMALIZED_DIR, "system-messages.json")),
    actionNames: await readJson(join(NORMALIZED_DIR, "action-names.json")),
    questText: await readJson(join(NORMALIZED_DIR, "quest-text.json")),
    zoneText: await readJson(join(NORMALIZED_DIR, "zone-text.json")),
  };

  const lookup = {
    npcNames: firstValueMap(buildIdMap(families.npcNames, { minId: 1, maxId: 10000000 })),
    itemText: buildIdMap(families.itemNames, { minId: 1, maxId: 10000000 }),
    skillText: buildIdMap(families.skillNames, { minId: 1, maxId: 10000000 }),
    systemMessages: sequentialTextMap(families.systemMessages, "systemmsg"),
    actionText: buildIdMap(families.actionNames, { minId: 1, maxId: 10000000 }),
    questText: buildIdMap(families.questText, { minId: 1, maxId: 10000000 }),
    zoneText: buildIdMap(families.zoneText, { minId: 1, maxId: 10000000 }),
  };

  const summary = {};
  for (const [key, value] of Object.entries(lookup)) summary[key] = Object.keys(value).length;

  await writeFile(join(OUT_DIR, "client-lookups.json"), JSON.stringify(lookup, null, 2));
  await writeFile(join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
