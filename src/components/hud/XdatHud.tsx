/**
 * XdatHud — the in-game HUD, rebuilt 1:1 from the real Superion (p474) client.
 *
 * Geometry note: the player CP/HP/MP/EXP gauges are NOT xdat child controls in
 * this chronicle — the native client draws them in C++ over the StatusWnd frame.
 * So we reproduce them here at the canonical L2 coordinates, using the real
 * extracted gauge sprites (public/hud/gauges/*.png) + the real frame sprites
 * (resolved through the SpriteProvider). Everything is laid out on a 1024-wide
 * baseline and scaled by `uiScale`, exactly like the client's UI scale slider.
 *
 * Drop-in replacement for L2HudAuthentic — same props.
 *
 *   <SpriteProvider><XdatHud activeChar={char} onExit={...} onSendChat={...}/></SpriteProvider>
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useSprites } from "@/components/hud/L2Sprite";
import { getGameConnection } from "@/lib/l2-protocol/game-client";
import { L2XdatWindow, type XdatWindowKey } from "@/components/hud/L2XdatWindow";
import { L2ExitDialog } from "@/components/hud/L2GameWindows";

export interface HudActiveChar {
  name: string;
  level: number;
  klass?: string;
  race?: string;
  hp?: number;
  hpMax?: number;
  mp?: number;
  mpMax?: number;
  cp?: number;
  cpMax?: number;
  expPct?: number;
}
export interface HudChatLine {
  color?: string;
  text: string;
}
interface XdatHudProps {
  uiScale?: number;
  activeChar?: HudActiveChar;
  chatLines?: HudChatLine[];
  onExit?: () => void;
  onSendChat?: (text: string) => void;
}

const GAUGE = "/hud/gauges"; // CP/HP/MP/EXP _bg.png + _fill.png (256x16)
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const ratio = (cur = 0, max = 0) => (max > 0 ? clamp01(cur / max) : 0);
const expRatio = (v = 0) => clamp01(v > 1 ? v / 100 : v);
const fmt = (n = 0) => Math.round(n).toLocaleString("en-US");

/** A single L2 status gauge: bg sprite + width-clipped fill sprite + centred text. */
function Gauge({
  kind, cur, max, w, h = 12, label, showText = true,
}: { kind: "CP" | "HP" | "MP" | "EXP"; cur?: number; max?: number; w: number; h?: number; label?: string; showText?: boolean }) {
  const r = kind === "EXP" ? expRatio(cur) : ratio(cur, max);
  return (
    <div style={{ position: "relative", width: w, height: h, backgroundImage: `url(${GAUGE}/${kind}_bg.png)`, backgroundSize: "100% 100%", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, width: `${r * 100}%`, backgroundImage: `url(${GAUGE}/${kind}_fill.png)`, backgroundSize: `${w}px 100%`, backgroundRepeat: "no-repeat" }} />
      {showText && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Tahoma, sans-serif", fontSize: Math.max(8, h - 4), lineHeight: 1, color: "#f3ecd2", textShadow: "0 1px 1px #000, 0 0 2px #000", whiteSpace: "nowrap", pointerEvents: "none" }}>
          {label ?? (kind === "EXP" ? `${(expRatio(cur) * 100).toFixed(2)}%` : `${fmt(cur)} / ${fmt(max)}`)}
        </div>
      )}
    </div>
  );
}

/** A sprite by refId, sized; falls back to a subtle panel if missing. */
function Spr({ refId, w, h, style, children }: { refId: string; w?: number; h?: number; style?: CSSProperties; children?: ReactNode }) {
  const reg = useSprites();
  const url = reg?.url(refId) ?? null;
  return (
    <div style={{ width: w, height: h, backgroundImage: url ? `url(${url})` : undefined, backgroundSize: "100% 100%", background: url ? undefined : "rgba(20,18,14,.55)", border: url ? undefined : "1px solid #3a342a", position: "relative", ...style }}>
      {children}
    </div>
  );
}

// Menu entries -> the xdat window each opens (+ optional hotkey).
type MenuItem = { label: string; title: string; win?: XdatWindowKey; key?: string; action?: "exit" };
const RIGHT_MENU: MenuItem[] = [
  { label: "INV", title: "Inventory", win: "equipment", key: "i" },
  { label: "ACT", title: "Actions", win: "actions" },
  { label: "SKL", title: "Skills", win: "skills", key: "k" },
  { label: "QST", title: "Quest", win: "quest", key: "j" },
  { label: "CHR", title: "Character", win: "character", key: "t" },
  { label: "CLN", title: "Clan", win: "clan" },
  { label: "MAP", title: "Map", win: "map", key: "m" },
  { label: "SYS", title: "System / Exit", action: "exit" },
];
const BOTTOM_MENU: MenuItem[] = [
  { label: "INV", title: "Inventory", win: "equipment", key: "i" },
  { label: "SKL", title: "Skills", win: "skills", key: "k" },
  { label: "QST", title: "Quest", win: "quest" },
  { label: "MAP", title: "Map", win: "map" },
  { label: "STR", title: "Store", win: "store" },
  { label: "SYS", title: "Exit", action: "exit" },
];

/** Live minimap: player centred, NPCs/players as dots, scaled from world coords. */
function Minimap({ size = 168, name }: { size?: number; name: string }) {
  const reg = useSprites();
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    let raf = 0;
    const VIEW = 6000; // world units across the minimap
    const scale = size / VIEW;
    const draw = () => {
      const cv = ref.current;
      const conn = getGameConnection();
      if (cv) {
        const ctx = cv.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, size, size);
          const p = conn?.getPlayer?.();
          const cx = size / 2, cy = size / 2;
          // range rings
          ctx.strokeStyle = "rgba(120,140,110,.18)";
          for (const rr of [size / 4, size / 2.4]) { ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke(); }
          if (p) {
            for (const e of conn?.getEntities?.() ?? []) {
              const dx = (e.x - p.x) * scale, dy = (e.y - p.y) * scale;
              if (Math.hypot(dx, dy) > size / 2 - 4) continue;
              ctx.fillStyle = e.isPlayer ? "#5fa9ff" : "#d7b24a";
              ctx.beginPath(); ctx.arc(cx + dx, cy + dy, e.isPlayer ? 2.4 : 2, 0, Math.PI * 2); ctx.fill();
            }
          }
          // self
          ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "#1a2a16"; ctx.lineWidth = 1; ctx.stroke();
        }
      }
      raf = requestAnimationFrame(() => setTimeout(() => { raf = requestAnimationFrame(draw); }, 400));
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [size]);
  const frame = reg?.url("L2UI_CT1.Minimap.Minimap_DF_TexShadowBottom") ?? null;
  return (
    <div style={{ width: size, height: size, position: "relative", border: "2px solid #2c2415", borderRadius: 4, background: "radial-gradient(circle at 50% 50%, #1b2a1d, #0c130d 78%)", backgroundImage: frame ? `url(${frame})` : undefined, backgroundSize: "100% 100%" }}>
      <canvas ref={ref} width={size} height={size} style={{ position: "absolute", inset: 0 }} />
      <span style={{ position: "absolute", left: 4, top: 2, fontSize: 9, color: "#9fb089", textShadow: "0 1px 1px #000", pointerEvents: "none" }}>{name}</span>
    </div>
  );
}

export function XdatHud({ uiScale = 1.0, activeChar, chatLines, onExit, onSendChat }: XdatHudProps) {
  const [chatText, setChatText] = useState("");
  const [openWindows, setOpenWindows] = useState<XdatWindowKey[]>([]);
  const [exitOpen, setExitOpen] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const toggleWindow = (k: XdatWindowKey) =>
    setOpenWindows((ws) => (ws.includes(k) ? ws.filter((w) => w !== k) : [...ws, k]));
  const closeWindow = (k: XdatWindowKey) => setOpenWindows((ws) => ws.filter((w) => w !== k));
  const runItem = (m: MenuItem) => { if (m.action === "exit") setExitOpen(true); else if (m.win) toggleWindow(m.win); };

  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatLines]);

  // Hotkeys (skip while typing in an input). Esc closes the topmost window / exit dialog.
  useEffect(() => {
    const keyMap: Record<string, XdatWindowKey> = {};
    for (const m of RIGHT_MENU) if (m.key && m.win) keyMap[m.key] = m.win;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.matches?.("input,textarea")) return;
      if (e.key === "Escape") { setExitOpen(false); setOpenWindows((ws) => ws.slice(0, -1)); return; }
      const k = e.key.toLowerCase();
      if (keyMap[k]) { e.preventDefault(); toggleWindow(keyMap[k]); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // vitals come from the activeChar snapshot, which /world keeps live from packets
  const name = activeChar?.name ?? "—";
  const level = activeChar?.level ?? 1;
  const hp = activeChar?.hp ?? 0;
  const hpMax = Math.max(activeChar?.hpMax ?? 0, hp, 1);
  const mp = activeChar?.mp ?? 0;
  const mpMax = Math.max(activeChar?.mpMax ?? 0, mp, 1);
  const cp = activeChar?.cp ?? 0;
  const cpMax = Math.max(activeChar?.cpMax ?? 0, cp, 1);
  const expPct = activeChar?.expPct ?? 0;

  const lines = chatLines ?? [];

  // ---- layout (1024 baseline, scaled) ----
  const root: CSSProperties = {
    position: "absolute", inset: 0, pointerEvents: "none",
    fontFamily: "Tahoma, sans-serif", color: "#e6dcc0", userSelect: "none",
    transform: `scale(${uiScale})`, transformOrigin: "top left",
    width: `${100 / uiScale}%`, height: `${100 / uiScale}%`,
  };
  const STATUS_W = 215;

  return (
    <div style={root}>
      {/* ───── Player status (top-left) ───── */}
      <div style={{ position: "absolute", left: 7, top: 6, width: STATUS_W, pointerEvents: "auto" }}>
        {/* level badge + name row */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <Spr refId="L2UI_CH3.PlayerStatusWnd.ps_levelback" w={34} h={20}
               style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#f3e6b8", textShadow: "0 1px 1px #000" }}>{level}</span>
          </Spr>
          <span style={{ fontSize: 12, fontWeight: 700, textShadow: "0 1px 1px #000", letterSpacing: .2 }}>{name}</span>
        </div>
        {/* gauges */}
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Gauge kind="CP" cur={cp} max={cpMax} w={STATUS_W} h={11} />
          <Gauge kind="HP" cur={hp} max={hpMax} w={STATUS_W} h={13} />
          <Gauge kind="MP" cur={mp} max={mpMax} w={STATUS_W} h={11} />
        </div>
      </div>

      {/* ───── Minimap (top-right, live) ───── */}
      <div style={{ position: "absolute", right: 8, top: 8, pointerEvents: "auto" }}>
        <Minimap size={168} name={name} />
      </div>

      {/* ───── Right-side vertical menu buttons ───── */}
      <div style={{ position: "absolute", right: 6, top: 190, display: "flex", flexDirection: "column", gap: 3, pointerEvents: "auto" }}>
        {RIGHT_MENU.map((m) => {
          const active = m.win ? openWindows.includes(m.win) : false;
          return (
            <button key={m.title} title={m.title + (m.key ? ` (${m.key.toUpperCase()})` : "")} onClick={() => runItem(m)}
              style={{ width: 34, height: 26, fontSize: 10, fontWeight: 700, letterSpacing: .3, lineHeight: 1, cursor: "pointer",
                       color: active ? "#fff0c0" : "#e6dcc0",
                       background: active ? "linear-gradient(180deg,#6a5a2a,#3a3018)" : "linear-gradient(180deg,#3a342a,#221e18)",
                       border: "1px solid #5a4a2a", borderRadius: 3, textShadow: "0 1px 1px #000" }}>
              {m.label}
            </button>
          );
        })}
      </div>

      {/* ───── Shortcut hotbar (bottom-center) ───── */}
      <div style={{ position: "absolute", left: "50%", bottom: 28, transform: "translateX(-50%)", pointerEvents: "auto" }}>
        <div style={{ display: "flex", gap: 1, padding: 3, background: "linear-gradient(180deg,#26221a,#14110c)", border: "1px solid #4a4030", borderRadius: 3 }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <Spr key={i} refId="L2UI_CT1.ItemWindow_DF_SlotBox_Default" w={32} h={32}
              style={{ display: "flex", alignItems: "flex-start", justifyContent: "flex-start" }}>
              <span style={{ fontSize: 8, color: "#9a8f6f", padding: 1 }}>{(i + 1) % 10}</span>
            </Spr>
          ))}
        </div>
      </div>

      {/* ───── Bottom-right main menu bar ───── */}
      <div style={{ position: "absolute", right: 8, bottom: 28, display: "flex", gap: 2, pointerEvents: "auto" }}>
        {BOTTOM_MENU.map((m) => {
          const active = m.win ? openWindows.includes(m.win) : false;
          return (
            <button key={m.title} title={m.title} onClick={() => runItem(m)}
              style={{ width: 32, height: 24, fontSize: 10, fontWeight: 700, cursor: "pointer",
                       color: active ? "#fff0c0" : "#e6dcc0",
                       background: active ? "linear-gradient(180deg,#6a5a2a,#3a3018)" : "linear-gradient(180deg,#3a342a,#221e18)",
                       border: "1px solid #5a4a2a", borderRadius: 3 }}>
              {m.label}
            </button>
          );
        })}
      </div>

      {/* ───── Chat (bottom-left) ───── */}
      <div style={{ position: "absolute", left: 8, bottom: 28, width: 360, pointerEvents: "auto" }}>
        <div ref={chatScrollRef} style={{ maxHeight: 116, overflowY: "auto", padding: "4px 6px", fontSize: 11, lineHeight: 1.45, background: "rgba(8,10,8,.35)", borderRadius: 3 }}>
          {lines.map((l, i) => (
            <div key={i} style={{ color: l.color ?? "#cabf9b", textShadow: "0 1px 1px #000" }}>{l.text}</div>
          ))}
        </div>
        {onSendChat && (
          <input
            value={chatText}
            onChange={(e) => setChatText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && chatText.trim()) { onSendChat(chatText.trim()); setChatText(""); } }}
            placeholder="Press Enter to chat"
            style={{ marginTop: 3, width: "100%", boxSizing: "border-box", height: 20, padding: "0 6px", fontSize: 11,
                     color: "#f3ecd2", background: "rgba(8,10,8,.55)", border: "1px solid #4a4030", borderRadius: 3, outline: "none" }}
          />
        )}
      </div>

      {/* ───── EXP bar (very bottom, full width) ───── */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 8, pointerEvents: "auto" }}>
        <Gauge kind="EXP" cur={expPct} w={1024} h={8} showText={false} />
      </div>

      {/* ───── Open game windows (Inventory / Skills / Map / …) ───── */}
      {openWindows.map((k) => (
        <div key={k} style={{ pointerEvents: "auto" }}>
          <L2XdatWindow windowKey={k} onClose={() => closeWindow(k)} />
        </div>
      ))}

      {/* ───── Exit dialog ───── */}
      {exitOpen && (
        <div style={{ pointerEvents: "auto" }}>
          <L2ExitDialog onExit={() => { setExitOpen(false); onExit?.(); }} onCancel={() => setExitOpen(false)} />
        </div>
      )}
    </div>
  );
}

export default XdatHud;
