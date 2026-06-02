/**
 * Minimal parser + accessor for the bundled L2 client `l2.ini` (served from
 * /l2.ini). The original game reads this file to discover the login server,
 * which asset folders/extensions belong to the virtual filesystem, the
 * startup map, etc. We mirror the parts we actually use so the web client
 * can stay in sync with the real client's expectations (e.g. resolving
 * `Index.unr` from Maps/, or knowing which extensions live in Animations/).
 */

export type L2Ini = Record<string, Record<string, string | string[]>>;

let cached: L2Ini | null = null;
let inflight: Promise<L2Ini> | null = null;

export async function loadL2Ini(): Promise<L2Ini> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = fetch("/l2.ini")
    .then((r) => {
      if (!r.ok) throw new Error(`l2.ini fetch failed: ${r.status}`);
      return r.text();
    })
    .then((text) => {
      cached = parseIni(text);
      return cached;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function parseIni(text: string): L2Ini {
  const out: L2Ini = {};
  let section = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) continue;
    const sec = line.match(/^\[(.+)\]$/);
    if (sec) {
      section = sec[1];
      out[section] ??= {};
      continue;
    }
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    out[section] ??= {};
    const cur = out[section][key];
    if (cur === undefined) out[section][key] = val;
    else if (Array.isArray(cur)) cur.push(val);
    else out[section][key] = [cur, val];
  }
  return out;
}

export function get(ini: L2Ini, section: string, key: string): string | undefined {
  const v = ini[section]?.[key];
  return Array.isArray(v) ? v[0] : v;
}

export function getAll(ini: L2Ini, section: string, key: string): string[] {
  const v = ini[section]?.[key];
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

/** Asset search paths from [Core.System] (e.g. "../Maps/*.unr"). */
export function getSearchPaths(ini: L2Ini): { folder: string; ext: string }[] {
  return getAll(ini, "Core.System", "Paths")
    .map((p) => p.replace(/\\/g, "/"))
    .map((p) => {
      const m = p.match(/\.\.\/(.+?)\/\*\.(.+)$/i);
      return m ? { folder: m[1], ext: m[2].toLowerCase() } : null;
    })
    .filter((x): x is { folder: string; ext: string } => x !== null);
}

/** Resolve a bare asset name (e.g. "Index.unr") to a CDN-relative path. */
export function resolveAsset(ini: L2Ini, fileName: string): string | null {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (!ext) return null;
  for (const { folder, ext: e } of getSearchPaths(ini)) {
    if (e === ext) return `${folder}/${fileName}`;
  }
  return null;
}

export interface L2Summary {
  authServer: string | undefined;
  port: string | undefined;
  startupMap: string | undefined;
  localMap: string | undefined;
  homeUrl: string | undefined;
  autoLogin: { enabled: boolean; id?: string; slot?: string };
  searchPaths: { folder: string; ext: string }[];
}

export function summarize(ini: L2Ini): L2Summary {
  return {
    authServer: get(ini, "Auth", "ServerAddr"),
    port: get(ini, "URL", "Port"),
    startupMap: get(ini, "URL", "Map"),
    localMap: get(ini, "URL", "LocalMap"),
    homeUrl: get(ini, "URL", "L2HomeURL"),
    autoLogin: {
      enabled: /^true$/i.test(get(ini, "AutoLogOn", "IsL2AutoLogOn") ?? ""),
      id: get(ini, "AutoLogOn", "L2ID"),
      slot: get(ini, "AutoLogOn", "L2Slot"),
    },
    searchPaths: getSearchPaths(ini),
  };
}
