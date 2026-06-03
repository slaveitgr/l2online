#!/usr/bin/env node
import { readdir, readFile, mkdir, writeFile, stat } from "node:fs/promises";
import { join, relative, dirname, extname, basename } from "node:path";
import { inflateSync } from "node:zlib";
import { createHash } from "node:crypto";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const SYSTEM_DIR = join(ROOT, "system");
const OUT_DIR = join(ROOT, ".l2system-index");
const DECODED_DIR = join(OUT_DIR, "decoded");
const TEXT_DIR = join(OUT_DIR, "text");
const CATALOG_DIR = join(OUT_DIR, "catalog");

const ORIGINAL_413_KEY = Buffer.from(
  "l985hHLd9zfvCgzRfo0XLw/vFmGjiorh1ugpvBxuTDz8GSkt2p75AXXkbnOUoYhQtkF9A75u6idNPtHd5bXXvecswKC3HQNghlVjOIF5OgLJpn2e8rRet8CNS+MpCDzkUOaPeGe2dJMU1AUR0JvFdEVRuqhqidw4Ej3BZo/XLYM=",
  "base64",
);
const CUSTOM_413_KEY = Buffer.from(
  "dbTW3lwBZUQGihrPElhp9D0uCfxVuLHiiVVtr5uHV2NVk0RiiLNlPaHOkch7saXBjxYyNJXFXX1ywIkKg/ab/R/ZQ06xwC8+Rnnt+kMwkxkHASnCZ8hTGYJSuIDk=",
  "base64",
);
// Some public notes list the custom key with a longer middle section. Keep it as
// a fallback only; official client files normally decode with ORIGINAL_413_KEY.
const CUSTOM_413_KEY_ALT = Buffer.from(
  "dbTW3lwBZUQGihrPElhp9D0uCfxVuLHiiVVtr5uHV2NVk0RiiLNlPaHOkch7saXBjxYyNJXFXX1ywIkKg/ab/R/ZQ06xwC8+Rnnt+kMwkxkHASnCZ8hWBNh7tluuIF3jcHrx0hCIgau1Z8Oz0GmuZ8OkxqOqk9JkE9TGYJSuIDk=",
  "base64",
);
const LINEAGEJS_413_KEY = Buffer.from(
  "75b4d6de5c016544068a1acf125869f43d2e09fc55b8b1e289556daf9b8757635593446288b3653da1ce91c87bb1a5c18f16323495c55d7d72c0890a83f69bfd1fd9434eb1c02f3e4679edfa43309319070129c267c85604d87bb65bae205de3707af1d2108881abb567c3b3d069ae67c3a4c6a3aa93d26413d4c66094ae2039",
  "hex",
);

function bigIntFromBuffer(buf) {
  return BigInt(`0x${buf.toString("hex")}`);
}

function bufferFromBigInt(n, minBytes = 0) {
  let hex = n.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  const buf = Buffer.from(hex, "hex");
  if (buf.length >= minBytes) return buf;
  return Buffer.concat([Buffer.alloc(minBytes - buf.length), buf]);
}

function modPow(base, exponent, modulus) {
  let result = 1n;
  base %= modulus;
  while (exponent > 0n) {
    if (exponent & 1n) result = (result * base) % modulus;
    exponent >>= 1n;
    base = (base * base) % modulus;
  }
  return result;
}

function decodeUtf16Header(buf) {
  let end = 0;
  while (end + 1 < Math.min(buf.length, 64)) {
    const c = buf.readUInt16LE(end);
    if (c < 32 || c > 126) break;
    end += 2;
  }
  return {
    text: buf.subarray(0, end).toString("utf16le"),
    bytes: end,
  };
}

function isMostlyText(buf) {
  if (!buf.length) return false;
  let printable = 0;
  const sample = buf.subarray(0, Math.min(buf.length, 4096));
  for (const b of sample) {
    if (b === 9 || b === 10 || b === 13 || (b >= 32 && b <= 126)) printable++;
  }
  return printable / sample.length > 0.82;
}

function parseIniLike(text) {
  const root = {};
  let section = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) continue;
    const sec = line.match(/^\[(.+)]$/);
    if (sec) {
      section = sec[1];
      root[section] ??= {};
      continue;
    }
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    (root[section] ??= {})[key] = value;
  }
  return root;
}

function isUsefulString(text) {
  const t = text.trim();
  if (t.length < 2) return false;
  let useful = 0;
  for (const ch of t) {
    const c = ch.codePointAt(0);
    if (
      (c >= 0x20 && c <= 0x7e) ||
      (c >= 0x0370 && c <= 0x03ff) ||
      (c >= 0x0400 && c <= 0x052f)
    ) useful++;
  }
  return useful / t.length > 0.72;
}

function extractAsciiStrings(buf, min = 4, max = 20000) {
  const out = [];
  let cur = "";
  let start = 0;
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b >= 32 && b <= 126) cur += String.fromCharCode(b);
    else {
      if (cur.length >= min && isUsefulString(cur)) out.push({ encoding: "ascii", offset: start, text: cur });
      if (out.length >= max) return out;
      cur = "";
      start = i + 1;
    }
  }
  if (cur.length >= min && isUsefulString(cur)) out.push({ encoding: "ascii", offset: start, text: cur });
  return out;
}

function isLikelyTextCodepoint(code) {
  return (
    (code >= 0x20 && code <= 0x7e) ||
    (code >= 0x0370 && code <= 0x03ff) ||
    (code >= 0x0400 && code <= 0x052f)
  );
}

function extractUtf16Strings(buf, min = 4, max = 20000) {
  const out = [];
  for (const endian of ["le", "be"]) for (const alignment of [0, 1]) {
    let cur = "";
    let start = alignment;
    for (let i = alignment; i + 1 < buf.length; i += 2) {
      const code = endian === "le" ? buf.readUInt16LE(i) : buf.readUInt16BE(i);
      if (isLikelyTextCodepoint(code)) cur += String.fromCharCode(code);
      else {
        if (cur.length >= min && isUsefulString(cur)) out.push({ encoding: `utf16${endian}`, offset: start, text: cur });
        if (out.length >= max) return out;
        cur = "";
        start = i + 2;
      }
    }
    if (cur.length >= min && isUsefulString(cur)) out.push({ encoding: `utf16${endian}`, offset: start, text: cur });
    if (out.length >= max) return out;
  }
  return out;
}

function idCandidatesBefore(buf, offset) {
  const out = [];
  const start = Math.max(0, offset - 32);
  for (let p = start; p + 4 <= offset; p++) {
    const value = buf.readUInt32LE(p);
    if (value > 0 && value < 10000000) out.push({ offset: p, value, distance: offset - p });
  }
  out.sort((a, b) => a.distance - b.distance || a.value - b.value);
  return out.slice(0, 8);
}

function uniqueStrings(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = `${item.encoding}:${item.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function datCatalog(decoded) {
  const strings = uniqueStrings([...extractAsciiStrings(decoded), ...extractUtf16Strings(decoded)]).slice(0, 10000);
  const rowCountHint = decoded.length >= 4 ? decoded.readUInt32LE(0) : null;
  const semanticStrings = strings
    .filter((s) => s.text.trim().length >= 2 && !/^[\x00-\x1f]+$/.test(s.text))
    .slice(0, 2000)
    .map((s) => ({ ...s, idCandidates: idCandidatesBefore(decoded, s.offset) }));
  return {
    decodedSize: decoded.length,
    rowCountHint,
    stringCount: strings.length,
    strings,
    semanticStrings,
  };
}

function decodeLineage413(buf) {
  const header = decodeUtf16Header(buf);
  if (!/^Lineage2Ver4135?$/.test(header.text)) return null;
  const payload = buf.subarray(header.bytes);
  const blocks = Math.floor(payload.length / 128);
  if (blocks < 1) throw new Error("no RSA blocks");

  const attempts = [
    { name: "lineagejs-413", key: LINEAGEJS_413_KEY, exp: 0x1dn, layout: "byte3-offset128" },
    { name: "original-413", key: ORIGINAL_413_KEY, exp: 0x35n },
    { name: "custom-413", key: CUSTOM_413_KEY, exp: 0x1dn },
    { name: "custom-413-alt", key: CUSTOM_413_KEY_ALT, exp: 0x1dn },
  ];

  const errors = [];
  for (const attempt of attempts) {
    try {
      const modulus = bigIntFromBuffer(attempt.key);
      const chunks = [];
      for (let i = 0; i < blocks; i++) {
        const encrypted = payload.subarray(i * 128, i * 128 + 128);
        const minBytes = attempt.layout === "byte3-offset128" ? 128 : 125;
        const decrypted = bufferFromBigInt(modPow(bigIntFromBuffer(encrypted), attempt.exp, modulus), minBytes);
        if (attempt.layout === "byte3-offset128") {
          const size = decrypted[3];
          const offset = 128 - size - ((124 - size) % 4);
          if (size <= 0 || offset < 0 || offset + size > decrypted.length) {
            throw new Error(`bad block payload size ${size} offset ${offset}`);
          }
          chunks.push(decrypted.subarray(offset, offset + size));
        } else {
          const size = decrypted[0];
          if (size > decrypted.length - 1) throw new Error(`bad block payload size ${size}`);
          if (size === 0x7c) chunks.push(decrypted.subarray(decrypted.length - size));
          else {
            let p = decrypted.length - size;
            while (p > 2 && decrypted[p - 1] !== 0) p--;
            chunks.push(decrypted.subarray(p, p + size));
          }
        }
      }
      const packed = Buffer.concat(chunks);
      if (packed.length < 8) throw new Error("decoded stream too short");
      const expectedSize = packed.readUInt32LE(0);
      const inflated = inflateSync(packed.subarray(4));
      if (inflated.length !== expectedSize) {
        throw new Error(`inflated size mismatch ${inflated.length} != ${expectedSize}`);
      }
      return {
        codec: attempt.name,
        header: header.text,
        decoded: inflated,
      };
    } catch (err) {
      errors.push(`${attempt.name}: ${err.message}`);
    }
  }
  throw new Error(errors.join("; "));
}

function decodeLineage111XorText(buf) {
  const header = decodeUtf16Header(buf);
  if (header.text !== "Lineage2Ver111") return null;
  const body = buf.subarray(header.bytes);
  const out = Buffer.alloc(body.length);
  for (let i = 0; i < body.length; i++) out[i] = body[i] ^ 0xac;
  return { header: header.text, decoded: out };
}

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

async function ensureParent(path) {
  await mkdir(dirname(path), { recursive: true });
}

function classifyDatName(name) {
  const n = name.toLowerCase();
  if (/(npcname|petname|zonename|skillname|questname|actionname|statisticname|localize|tutorialname)/.test(n)) return "localized-names";
  if (/(item|weapon|armor|etcitem|setitem|ensoul|enchant|variation|hair|cloak)/.test(n)) return "items-equipment";
  if (/(skill|effect|abnormal|sound|anim)/.test(n)) return "skills-effects";
  if (/(map|minimap|zone|hunting|raid|staticobject|scene)/.test(n)) return "world-map";
  if (/(interface|shortcut|window|html|popup|store|shop)/.test(n)) return "ui";
  return "data";
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(DECODED_DIR, { recursive: true });
  await mkdir(TEXT_DIR, { recursive: true });
  await mkdir(CATALOG_DIR, { recursive: true });

  const files = await walk(SYSTEM_DIR);
  const manifest = [];
  const summaries = {
    totalFiles: files.length,
    decodedDat: 0,
    failedDat: 0,
    parsedText: 0,
    extractedStrings: 0,
    catalogedDat: 0,
    byExtension: {},
    byDatFamily: {},
  };

  for (const file of files) {
    const rel = relative(SYSTEM_DIR, file);
    const ext = extname(file).toLowerCase() || "(none)";
    const st = await stat(file);
    const buf = await readFile(file);
    const sha1 = createHash("sha1").update(buf).digest("hex");
    const entry = {
      path: rel,
      ext,
      size: st.size,
      sha1,
      kind: "binary",
      header: null,
      output: null,
      error: null,
    };
    summaries.byExtension[ext] = (summaries.byExtension[ext] ?? 0) + 1;

    const header = decodeUtf16Header(buf);
    if (header.text.startsWith("Lineage2Ver")) entry.header = header.text;

    if ((ext === ".dat" || ext === ".ini") && /^Lineage2Ver4135?$/.test(header.text)) {
      const family = classifyDatName(basename(file));
      entry.datFamily = family;
      summaries.byDatFamily[family] = (summaries.byDatFamily[family] ?? 0) + 1;
      try {
        const decoded = decodeLineage413(buf);
        const outRel = `${rel}.decoded`;
        const outPath = join(DECODED_DIR, outRel);
        await ensureParent(outPath);
        await writeFile(outPath, decoded.decoded);
        entry.kind = "lineage-dat";
        entry.codec = decoded.codec;
        entry.decodedSize = decoded.decoded.length;
        entry.decodedSha1 = createHash("sha1").update(decoded.decoded).digest("hex");
        entry.output = relative(ROOT, outPath);
        const catalog = datCatalog(decoded.decoded);
        const catalogRel = `${rel}.catalog.json`;
        const catalogPath = join(CATALOG_DIR, catalogRel);
        await ensureParent(catalogPath);
        await writeFile(catalogPath, JSON.stringify(catalog, null, 2));
        entry.catalogOutput = relative(ROOT, catalogPath);
        entry.rowCountHint = catalog.rowCountHint;
        entry.stringCount = catalog.stringCount;
        summaries.catalogedDat++;
        if (isMostlyText(decoded.decoded)) {
          const text = decoded.decoded.toString("utf8");
          const txtRel = `${rel}.txt`;
          const txtPath = join(TEXT_DIR, txtRel);
          await ensureParent(txtPath);
          await writeFile(txtPath, text);
          entry.textOutput = relative(ROOT, txtPath);
        }
        summaries.decodedDat++;
      } catch (err) {
        entry.error = err.message;
        summaries.failedDat++;
      }
    } else if (ext === ".int" && header.text === "Lineage2Ver111") {
      const decoded = decodeLineage111XorText(buf);
      const text = decoded.decoded.toString("utf8");
      const rawRel = `${rel}.decoded`;
      const rawPath = join(DECODED_DIR, rawRel);
      await ensureParent(rawPath);
      await writeFile(rawPath, decoded.decoded);
      const outRel = `${rel}.json`;
      const outPath = join(TEXT_DIR, outRel);
      await ensureParent(outPath);
      await writeFile(outPath, JSON.stringify(parseIniLike(text), null, 2));
      entry.kind = "lineage111-ini";
      entry.codec = "xor-0xac";
      entry.output = relative(ROOT, outPath);
      entry.decodedOutput = relative(ROOT, rawPath);
      summaries.parsedText++;
    } else if ([".ini", ".int"].includes(ext) && isMostlyText(buf)) {
      const text = buf.toString("utf8");
      const outRel = `${rel}.json`;
      const outPath = join(TEXT_DIR, outRel);
      await ensureParent(outPath);
      await writeFile(outPath, JSON.stringify(parseIniLike(text), null, 2));
      entry.kind = "ini-like";
      entry.output = relative(ROOT, outPath);
      summaries.parsedText++;
    } else if ([".u", ".xdat", ".gly"].includes(ext)) {
      const strings = uniqueStrings([...extractAsciiStrings(buf), ...extractUtf16Strings(buf)]).slice(0, 5000);
      const outRel = `${rel}.strings.json`;
      const outPath = join(TEXT_DIR, outRel);
      await ensureParent(outPath);
      await writeFile(outPath, JSON.stringify(strings, null, 2));
      entry.kind = "strings";
      entry.output = relative(ROOT, outPath);
      entry.stringCount = strings.length;
      summaries.extractedStrings++;
    }

    manifest.push(entry);
  }

  await writeFile(join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
  await writeFile(join(OUT_DIR, "summary.json"), JSON.stringify(summaries, null, 2));
  console.log(JSON.stringify(summaries, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
