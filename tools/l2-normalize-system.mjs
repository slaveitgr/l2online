#!/usr/bin/env node
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { join, relative, basename, dirname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const INDEX_DIR = join(ROOT, ".l2system-index");
const CATALOG_DIR = join(INDEX_DIR, "catalog");
const NORMALIZED_DIR = join(INDEX_DIR, "normalized");

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function sourceName(file) {
  return basename(file).replace(/\.dat\.catalog\.json$/, "");
}

function familyOf(source) {
  const s = source.toLowerCase();
  if (s.includes("npcname")) return "npc-names";
  if (s.includes("itemname")) return "item-names";
  if (s.includes("skillname")) return "skill-names";
  if (s.includes("systemmsg")) return "system-messages";
  if (s.includes("actionname")) return "action-names";
  if (s.includes("questname") || s.includes("newquest")) return "quest-text";
  if (s.includes("zonename") || s.includes("huntingzone")) return "zone-text";
  if (s.includes("localize")) return "localization";
  if (s.includes("npcstring")) return "npc-strings";
  if (s.includes("tutorial") || s.includes("gametip")) return "help-text";
  return "semantic-text";
}

function looksLikeUsefulText(text) {
  const t = text.trim();
  if (t.length < 2) return false;
  if (/^[0-9.+\-/*<>()\s]+$/.test(t) && t.length < 8) return false;
  if (/^[?@A-Fa-f0-9]{4,}$/.test(t)) return false;
  return true;
}

function chooseId(source, stringEntry, rowCountHint) {
  const candidates = stringEntry.idCandidates ?? [];
  const s = source.toLowerCase();
  let preferred;

  if (s.includes("itemname")) {
    preferred = candidates.find((c) => c.distance >= 8 && c.distance <= 13);
  } else if (s.includes("npcname") || s.includes("actionname")) {
    preferred = candidates.find((c) => c.distance >= 4 && c.distance <= 6);
  } else if (s.includes("systemmsg")) {
    preferred = candidates.find((c) => c.distance >= 4 && c.distance <= 9);
  } else {
    preferred = candidates.find((c) => c.distance >= 4 && c.distance <= 16);
  }

  preferred ??= candidates.find((c) => c.value !== rowCountHint && c.value > 0 && c.value < 10000000);
  if (!preferred) return null;
  return preferred.value;
}

function normalizeCatalog(source, rel, catalog) {
  const family = familyOf(source);
  const entries = [];
  const seen = new Set();

  for (const s of catalog.semanticStrings ?? []) {
    const text = s.text.trim();
    if (!looksLikeUsefulText(text)) continue;
    const id = chooseId(source, s, catalog.rowCountHint);
    const key = `${id ?? "noid"}:${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      id,
      text,
      encoding: s.encoding,
      offset: s.offset,
      source,
      sourcePath: rel,
      family,
      confidence: id == null ? "text-only" : "heuristic-id",
    });
  }

  return {
    source,
    sourcePath: rel,
    family,
    decodedSize: catalog.decodedSize,
    rowCountHint: catalog.rowCountHint,
    entryCount: entries.length,
    entries,
  };
}

async function main() {
  await mkdir(NORMALIZED_DIR, { recursive: true });
  const catalogFiles = (await walk(CATALOG_DIR)).filter((f) => f.endsWith(".dat.catalog.json"));
  const aggregate = {};
  const sources = [];

  for (const file of catalogFiles) {
    const rel = relative(CATALOG_DIR, file);
    const source = sourceName(file);
    const catalog = JSON.parse(await readFile(file, "utf8"));
    const normalized = normalizeCatalog(source, rel, catalog);
    sources.push({
      source,
      sourcePath: rel,
      family: normalized.family,
      rowCountHint: normalized.rowCountHint,
      decodedSize: normalized.decodedSize,
      entryCount: normalized.entryCount,
    });
    if (normalized.entryCount) {
      aggregate[normalized.family] ??= [];
      aggregate[normalized.family].push(...normalized.entries);
    }
    const outPath = join(NORMALIZED_DIR, `${rel}.normalized.json`);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(normalized, null, 2));
  }

  const summary = {
    sources: sources.length,
    families: Object.fromEntries(Object.entries(aggregate).map(([k, v]) => [k, v.length])),
  };

  for (const [family, entries] of Object.entries(aggregate)) {
    await writeFile(join(NORMALIZED_DIR, `${family}.json`), JSON.stringify(entries, null, 2));
  }
  await writeFile(join(NORMALIZED_DIR, "sources.json"), JSON.stringify(sources, null, 2));
  await writeFile(join(NORMALIZED_DIR, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
