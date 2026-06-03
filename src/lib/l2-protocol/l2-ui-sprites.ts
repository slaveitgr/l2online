/**
 * L2 UI sprite registry — resolves an Interface.xdat texture ref to a real PNG
 * extracted from the client (SysTextures/*.utx) by l2-extract-ui-textures.mjs.
 *
 * Public assets layout (copy .l2system-index/ui-textures/* into the web app):
 *   public/hud/ui/manifest.json          ← ref(lowercased) → "Pkg/Sprite.png"
 *   public/hud/ui/L2UI_CT1/Button_DF_Click.png ...
 *
 * Refs in xdat come in several shapes for the SAME sprite, e.g.
 *   "L2UI_CT1.Button.Button_DF_Click"   (Package.Group.Sprite)
 *   "l2ui_ct1.Button_DF_Click"          (Package.Sprite, lowercased)
 * so we index by full ref, by "pkg.sprite", and by bare "sprite" to resolve any.
 */
const BASE = "/hud/ui/";

export interface SpriteRegistry {
  url(ref: string): string | null;
  has(ref: string): boolean;
  /** raw manifest (lowercased ref → relative path) */
  manifest: Record<string, string | null>;
}

let _cache: Promise<SpriteRegistry> | null = null;

export function loadSprites(base = BASE): Promise<SpriteRegistry> {
  if (_cache) return _cache;
  _cache = fetch(base + "manifest.json")
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
    .then((manifest: Record<string, string | null>) => buildRegistry(manifest, base));
  return _cache;
}

/** Build a registry from an already-loaded manifest (no network). */
export function buildRegistry(manifest: Record<string, string | null>, base = BASE): SpriteRegistry {
  const byFull = new Map<string, string>();
  const byPkgSprite = new Map<string, string>();
  const bySprite = new Map<string, string>();
  for (const [ref, rel] of Object.entries(manifest)) {
    if (!rel) continue;
    const lc = ref.toLowerCase();
    byFull.set(lc, rel);
    const parts = lc.split(".");
    const sprite = parts[parts.length - 1];
    const pkg = parts[0];
    if (!byPkgSprite.has(`${pkg}.${sprite}`)) byPkgSprite.set(`${pkg}.${sprite}`, rel);
    if (!bySprite.has(sprite)) bySprite.set(sprite, rel); // first wins (CT1 ordered first-ish)
  }
  const resolve = (ref: string): string | null => {
    if (!ref) return null;
    const lc = ref.toLowerCase();
    if (byFull.has(lc)) return byFull.get(lc)!;
    const parts = lc.split(".");
    const sprite = parts[parts.length - 1];
    const pkg = parts[0];
    return byPkgSprite.get(`${pkg}.${sprite}`) ?? bySprite.get(sprite) ?? null;
  };
  return {
    manifest,
    has: (ref) => resolve(ref) != null,
    url: (ref) => {
      const rel = resolve(ref);
      return rel ? base + rel : null;
    },
  };
}

/** Canonical chrome sprite refs used across the HUD (so callers don't hardcode strings). */
export const UI = {
  button: { up: "L2UI_CT1.Button_DF_Click", over: "L2UI_CT1.Button_DF_Over", down: "L2UI_CT1.Button_DF_Down", disable: "L2UI_CT1.Button_DF_Disable" },
  buttonLarge: { up: "L2UI_CT1.Button_DF_Large", over: "L2UI_CT1.Button_DF_Large_Over", down: "L2UI_CT1.Button_DF_Large_Down" },
  buttonSmall: { up: "L2UI_CT1.Button_DF_Small", over: "L2UI_CT1.Button_DF_Small_Over", down: "L2UI_CT1.Button_DF_Small_Down" },
  frame: "L2UI_CT1.GroupBox_DF",
  frameBlack: "L2UI_CT1.GroupBox_Black",
  windowDisableBg: "L2UI_CT1.WindowDisable_BG",
  itemSlot: "L2UI_CT1.ItemWindow_DF_SlotBox",
  shortcutSlot: "L2UI_NewTex.ShotcutWnd_SlotBG",
  checkbox: { off: "L2UI.CheckBox", on: "L2UI.CheckBox_checked" },
  tab: { bg: "L2UI_CT1.Tab_DF_bg", selected: "L2UI_CT1.Tab_DF_Tab_Selected" },
  closeBtn: "L2UI_NewTex.Frame_CloseBtn_Over",
  divider: "L2UI_CT1.Divider_DF",
} as const;

/** 9-slice border insets (px) for stretchable chrome sprites; default falls back to ~25%. */
export const NINE_SLICE: Record<string, number> = {
  "L2UI_CT1.GroupBox_DF": 3,
  "L2UI_CT1.GroupBox_Black": 3,
  "L2UI_CT1.Button_DF_Click": 6,
  "L2UI_CT1.Button_DF_Over": 6,
  "L2UI_CT1.Button_DF_Down": 6,
  "L2UI_CT1.Button_DF_Disable": 6,
  "L2UI_CT1.Button_DF_Small": 5,
  "L2UI_CT1.Button_DF_Large": 8,
  "L2UI_CT1.ItemWindow_DF_SlotBox": 4,
};
