#!/usr/bin/env node
/**
 * l2-build-npc-appearance.mjs — derive npc-id → {race, gender} for HUMANOID
 * (player-race) NPCs from the L2J Mobius server npc XMLs. These town folk
 * (Folk / Merchant / VillageMaster / Teleporter / Guard …) are rendered with
 * the real race/gender body model; monsters are left as capsules until the
 * numeric *grp mesh mapping is solved.
 *
 * Usage: node tools/l2-build-npc-appearance.mjs [path-to-npc-xml-dir]
 * Out:   public/models/npc-appearance.json   { "<id>": ["<RaceName>","M|F"], ... }
 */
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");
const XML_DIR = process.argv[2] ??
  "/sessions/optimistic-focused-wozniak/mnt/outputs/l2jmobius/L2J_Mobius_12.3_Superion_Source/dist/game/data/stats/npcs";
const OUT = join(ROOT, "public", "models", "npc-appearance.json");

// server race enum → extracted body-model race name
const RACE_MAP = {
  HUMAN: "Human", ELF: "Elf", DARK_ELF: "Dark Elf",
  ORC: "Orc", DWARF: "Dwarf", KAMAEL: "Kamael", ERTHEIA: "Ertheia",
};

const npcRe = /<npc id="(\d+)"[^>]*?>(.*?)<\/npc>/gs;

async function main() {
  const files = (await readdir(XML_DIR)).filter((f) => f.endsWith(".xml"));
  const out = {};
  let scanned = 0;
  for (const f of files) {
    const text = await readFile(join(XML_DIR, f), "utf8");
    let m;
    while ((m = npcRe.exec(text))) {
      scanned++;
      const id = Number(m[1]);
      const body = m[2];
      const race = body.match(/<race>([^<]+)<\/race>/)?.[1];
      const modelRace = race && RACE_MAP[race];
      if (!modelRace) continue; // not a player-race humanoid → capsule
      const sex = body.match(/<sex>([^<]+)<\/sex>/)?.[1];
      const gender = sex === "FEMALE" ? "F" : "M";
      out[id] = [modelRace, gender];
    }
  }
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(out));
  const n = Object.keys(out).length;
  console.log(`scanned ${scanned} npcs · ${n} humanoid (player-race) → ${OUT} (${(JSON.stringify(out).length / 1024 | 0)}KB)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
