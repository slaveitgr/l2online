#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const OUT_DIR = join(ROOT, ".l2system-index");

function run(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(ROOT, "tools", script)], {
      cwd: ROOT,
      stdio: "inherit",
    });
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${script} exited ${code}`)));
  });
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

async function main() {
  await run("l2-system-indexer.mjs");
  await run("l2-normalize-system.mjs");
  await run("l2-build-lookups.mjs");
  await run("l2-parse-system-packages.mjs");
  await run("l2-parse-asset-packages.mjs");
  await run("l2-parse-xdat.mjs");
  await run("l2-build-ui-texture-manifest.mjs");

  const summary = await readJson(join(OUT_DIR, "summary.json"), {});
  const normalized = await readJson(join(OUT_DIR, "normalized", "summary.json"), {});
  const packages = await readJson(join(OUT_DIR, "packages", "summary.json"), []);
  const assetPackages = await readJson(join(OUT_DIR, "asset-packages", "report.json"), {});
  const xdat = await readJson(join(OUT_DIR, "xdat", "summary.json"), []);
  const uiTextures = await readJson(join(OUT_DIR, "ui-textures", "report.json"), {});
  const lookups = await readJson(join(OUT_DIR, "lookups", "summary.json"), {});
  const parsedPackages = packages.filter((p) => !p.error);
  const failedPackages = packages.filter((p) => p.error);

  const report = {
    generatedAt: new Date().toISOString(),
    systemRoot: join(ROOT, "system"),
    index: summary,
    normalized,
    lookups,
    packages: {
      total: packages.length,
      parsed: parsedPackages.length,
      failed: failedPackages.length,
      names: parsedPackages.reduce((n, p) => n + (p.nameCount ?? 0), 0),
      imports: parsedPackages.reduce((n, p) => n + (p.importCount ?? 0), 0),
      exports: parsedPackages.reduce((n, p) => n + (p.exportCount ?? 0), 0),
    },
    assetPackages,
    xdat: {
      total: xdat.length,
      parsedRecords: xdat.reduce((n, p) => n + (p.parsedRecords ?? 0), 0),
      controls: xdat.reduce((n, p) => n + (p.controls ?? 0), 0),
      windows: xdat.reduce((n, p) => n + (p.windows ?? 0), 0),
      texturedControls: xdat.reduce((n, p) => n + (p.texturedControls ?? 0), 0),
      files: xdat,
    },
    uiTextures: {
      xdatTextureRefs: uiTextures.xdatTextureRefs ?? 0,
      found: uiTextures.found ?? 0,
      missing: uiTextures.missing ?? 0,
      topMissing: uiTextures.topMissing ?? [],
      topUsed: uiTextures.topUsed ?? [],
    },
    outputs: {
      manifest: ".l2system-index/manifest.json",
      decoded: ".l2system-index/decoded",
      catalogs: ".l2system-index/catalog",
      normalized: ".l2system-index/normalized",
      lookups: ".l2system-index/lookups",
      packages: ".l2system-index/packages",
      assetPackages: ".l2system-index/asset-packages",
      xdat: ".l2system-index/xdat",
      uiTextures: ".l2system-index/ui-textures",
      text: ".l2system-index/text",
    },
  };
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(join(OUT_DIR, "parse-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
