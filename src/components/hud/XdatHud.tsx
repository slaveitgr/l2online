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
import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type MouseEvent as ReactMouseEvent } from "react";
import { useSprites } from "@/components/hud/L2Sprite";
import { getGameConnection, type GameEvent, type PlayerState, type SkillEntry } from "@/lib/l2-protocol/game-client";
import { L2XdatWindow, type XdatWindowKey } from "@/components/hud/L2XdatWindow";
import { L2ExitDialog } from "@/components/hud/L2GameWindows";

interface TargetInfo { objectId: number; name: string; level?: number; hp?: number; maxHp?: number; dead?: boolean }

/** L2 chat channel colours (ChatType client ids). */
function chatColor(ch: number): string {
  switch (ch) {
    case 1: return "#d88a3c";   // shout (orange)
    case 2: return "#d86adf";   // whisper (pink)
    case 3: return "#5fb0e8";   // party (blue)
    case 4: return "#6cae5a";   // clan (green)
    case 8: return "#caa86a";   // trade (gold)
    case 9: return "#9a8fe0";   // alliance
    case 10: case 18: case 19: return "#e0c84a"; // announce
    case 17: return "#e06a6a";  // hero
    default: return "#e6dcc0";  // general (white)
  }
}

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

/**
 * L2 HTML window — renders server HTML (NPC dialogs + the GM/admin panel) the
 * way the Windows client does. Handles the real L2 tag set:
 *   <button value="X" action="bypass [-h] CMD" width= height= back= fore=>
 *   <a action="bypass [-h] CMD">label</a>
 *   <edit var="V" width=>            (QuickBox; its value substitutes $V in a bypass)
 *   <br>/<br1>, <font color=>, <center>, <table>/<tr>/<td>
 * Anything unsafe (script/img/inline handlers) is stripped.
 */
function L2HtmlWindow({ html, title, onBypass, onClose }: { html: string; title: string; onBypass: (cmd: string) => void; onClose: () => void }) {
  const editVals = useRef<Record<string, string>>({});
  // Window title: a <title> tag if present, else the htm's first prominent header, else the default.
  const winTitle =
    (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] ??
    (html.match(/<center>\s*(?:<font[^>]*>)?\s*([^<>]{3,40}?)\s*(?:<\/font>)?\s*<br/i) || [])[1] ??
    title;

  const safe = html
    .replace(/<\s*script[\s\S]*?<\s*\/\s*script>/gi, "")
    .replace(/<\s*(img|imgsrc)[^>]*>/gi, "")
    .replace(/on\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/<br1\s*\/?>/gi, "<br>")
    // <button ... value="LABEL" ... action="bypass [-h] CMD" ...>  (attrs any order)
    .replace(/<button\b([^>]*)>/gi, (_m, attrs: string) => {
      const val = (attrs.match(/value\s*=\s*"([^"]*)"/i) || [])[1] ?? "";
      const act = (attrs.match(/action\s*=\s*"bypass(?:\s+-h)?\s+([^"]*)"/i) || [])[1];
      if (!act) return `<span class="l2btn">${val}</span>`;
      return `<button type="button" class="l2btn l2bypass" data-cmd="${act.replace(/"/g, "&quot;").trim()}">${val}</button>`;
    })
    .replace(/<\/button>/gi, "")
    // <edit var="V" width=N>
    .replace(/<edit\b([^>]*)\/?>/gi, (_m, attrs: string) => {
      const v = (attrs.match(/var\s*=\s*"([^"]*)"/i) || [])[1] ?? "val";
      const w = (attrs.match(/width\s*=\s*"?(\d+)"?/i) || [])[1] ?? "120";
      return `<input class="l2edit" data-var="${v}" style="width:${Math.min(+w, 260)}px" />`;
    })
    // <a action="bypass [-h] CMD">label</a>
    .replace(/<a\b[^>]*action\s*=\s*"bypass(?:\s+-h)?\s+([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
      (_m, cmd: string, label: string) => `<span class="l2bypass" data-cmd="${cmd.replace(/"/g, "&quot;").trim()}">${label}</span>`)
    .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1");

  // substitute $var / %var% in a command with current edit-box values
  const subst = (cmd: string) =>
    cmd.replace(/\$(\w+)/g, (_m, k) => editVals.current[k] ?? "")
       .replace(/%(\w+)%/g, (_m, k) => editVals.current[k] ?? "");

  const onClick = (e: ReactMouseEvent) => {
    const t = (e.target as HTMLElement).closest?.(".l2bypass") as HTMLElement | null;
    if (t?.dataset.cmd) { e.preventDefault(); onBypass(subst(t.dataset.cmd)); }
  };
  const onInput = (e: ReactMouseEvent) => {
    const el = e.target as HTMLInputElement;
    if (el.classList?.contains("l2edit") && el.dataset.var) editVals.current[el.dataset.var] = el.value;
  };

  return (
    <div style={{ position: "absolute", left: "50%", top: 70, transform: "translateX(-50%)", width: 440, maxHeight: 540, pointerEvents: "auto",
                  background: "linear-gradient(180deg,#20242c,#11151b)", border: "2px solid #2c3340", borderRadius: 4, color: "#d6cba6",
                  display: "flex", flexDirection: "column", boxShadow: "0 8px 28px rgba(0,0,0,.6)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px", borderBottom: "1px solid #303a48",
                    background: "linear-gradient(180deg,#39424f,#222933)" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#e9dfbf" }}>{winTitle}</span>
        <button onClick={onClose} style={{ width: 16, height: 16, fontSize: 10, color: "#cbbf9c", background: "transparent", border: "1px solid #5a4a2a", borderRadius: 2, cursor: "pointer" }}>×</button>
      </div>
      <div onClick={onClick} onInput={onInput} className="l2html"
        style={{ overflowY: "auto", padding: 10, fontSize: 12, lineHeight: 1.5, color: "#ccbf94" }}
        dangerouslySetInnerHTML={{ __html: safe }} />
      <style>{`
        .l2html{font-family:Tahoma,sans-serif}
        .l2html font[color]{color:inherit}
        .l2html font[color="LEVEL"]{color:#b59a4d}
        .l2html table{width:100%;border-collapse:collapse}
        .l2html td{padding:2px 3px;vertical-align:middle}
        .l2html a,.l2html .l2bypass:not(.l2btn){color:#7fb6ff;cursor:pointer;text-decoration:underline}
        .l2html .l2btn{display:inline-block;width:100%;min-width:62px;padding:3px 6px;margin:1px 0;text-align:center;
          font-size:11px;color:#e7dcba;cursor:pointer;border:1px solid #6b5a30;border-radius:2px;
          background:linear-gradient(180deg,#4a4230,#2a2418);text-shadow:0 1px 1px #000}
        .l2html .l2btn:hover{background:linear-gradient(180deg,#5e5238,#352d1c);color:#fff0c8}
        .l2html .l2btn:active{background:#241f14}
        .l2html .l2edit{height:18px;padding:0 5px;font-size:11px;color:#f3ecd2;
          background:#0c0f14;border:1px solid #4a4030;border-radius:2px;outline:none}
      `}</style>
    </div>
  );
}

/** Real skills window populated from SkillList (0x5F). Click an active skill to cast it. */
function SkillsPanel({ skills, onClose }: { skills: SkillEntry[]; onClose: () => void }) {
  const active = skills.filter((s) => !s.passive);
  const passive = skills.filter((s) => s.passive);
  const cast = (id: number) => getGameConnection()?.sendUseSkill?.(id);
  const Cell = ({ s }: { s: SkillEntry }) => (
    <button onClick={() => !s.passive && cast(s.id)} title={`Skill ${s.id} Lv${s.level}${s.passive ? " (passive)" : ""}`}
      style={{ width: 40, height: 40, position: "relative", cursor: s.passive ? "default" : "pointer", color: "#d9cda6",
               background: "linear-gradient(180deg,#2a2620,#16130d)", border: "1px solid #4a4030", borderRadius: 3,
               opacity: s.disabled ? 0.45 : 1, fontSize: 8, lineHeight: 1.1, overflow: "hidden" }}>
      <span style={{ position: "absolute", top: 2, left: 2, right: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>#{s.id}</span>
      <span style={{ position: "absolute", bottom: 1, right: 2, fontWeight: 700, color: "#f0e2b8" }}>{s.level}</span>
      {s.enchanted && <span style={{ position: "absolute", top: 1, right: 2, color: "#5fc0ff" }}>★</span>}
    </button>
  );
  return (
    <div style={{ position: "absolute", left: 360, top: 96, width: 470, maxHeight: 460, pointerEvents: "auto",
                  background: "linear-gradient(180deg,rgba(26,24,18,.97),rgba(13,11,8,.97))", border: "1px solid #5a4a2a", borderRadius: 5, color: "#e6dcc0", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 8px", borderBottom: "1px solid #3a3024" }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>Skills — {active.length} active, {passive.length} passive</span>
        <button onClick={onClose} style={{ width: 16, height: 16, fontSize: 10, color: "#cbbf9c", background: "transparent", border: "1px solid #5a4a2a", borderRadius: 2, cursor: "pointer" }}>×</button>
      </div>
      <div style={{ overflowY: "auto", padding: 8 }}>
        {skills.length === 0 && <div style={{ fontSize: 11, color: "#9a8f6f" }}>No skills received yet (the server sends SkillList on enter / level up).</div>}
        {active.length > 0 && <div style={{ fontSize: 10, color: "#9a8f6f", margin: "0 0 4px" }}>ACTIVE</div>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 8 }}>{active.map((s) => <Cell key={`a${s.id}`} s={s} />)}</div>
        {passive.length > 0 && <div style={{ fontSize: 10, color: "#9a8f6f", margin: "0 0 4px" }}>PASSIVE</div>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>{passive.map((s) => <Cell key={`p${s.id}`} s={s} />)}</div>
      </div>
    </div>
  );
}

export function XdatHud({ uiScale = 1.0, activeChar, chatLines, onExit, onSendChat }: XdatHudProps) {
  const [chatText, setChatText] = useState("");
  const [openWindows, setOpenWindows] = useState<XdatWindowKey[]>([]);
  const [exitOpen, setExitOpen] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  // live state driven by the protocol layer
  const [live, setLive] = useState<Partial<PlayerState>>({});
  const [target, setTarget] = useState<TargetInfo | null>(null);
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [feed, setFeed] = useState<HudChatLine[]>([]);
  const [floats, setFloats] = useState<{ id: number; text: string; crit: boolean }[]>([]);
  const [htmlWnd, setHtmlWnd] = useState<{ html: string } | null>(null);
  const floatId = useRef(0);

  const toggleWindow = (k: XdatWindowKey) =>
    setOpenWindows((ws) => (ws.includes(k) ? ws.filter((w) => w !== k) : [...ws, k]));
  const closeWindow = (k: XdatWindowKey) => setOpenWindows((ws) => ws.filter((w) => w !== k));
  const runItem = (m: MenuItem) => { if (m.action === "exit") setExitOpen(true); else if (m.win) toggleWindow(m.win); };

  // Send a bypass / admin command to the server (server replies with NpcHtml).
  const bypass = (cmd: string) => getGameConnection()?.sendBypass?.(cmd);

  // Chat submit: "//x" → GM/admin command (bypass admin_x); otherwise normal say.
  const submitChat = () => {
    const text = chatText.trim();
    if (!text) return;
    if (text.startsWith("//")) {
      bypass("admin_" + text.slice(2));
      setFeed((c) => [...c.slice(-200), { color: "#caa86a", text: `» ${text}` }]);
    } else {
      onSendChat?.(text);
    }
    setChatText("");
  };

  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatLines, feed]);

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

  // live state driven by the protocol layer (no handler clobbering — addListener)
  useEffect(() => {
    const conn = getGameConnection();
    if (!conn?.addListener) return;
    const p = conn.getPlayer?.(); if (p) setLive({ ...p });
    setSkills(conn.getSkills?.() ?? []);
    const off = conn.addListener((ev: GameEvent) => {
      switch (ev.type) {
        case "player":
          setLive({ ...ev.player });
          break;
        case "target-selected": {
          const e = conn.getEntity?.(ev.objectId);
          setTarget({ objectId: ev.objectId, name: e?.name ?? (e?.isPlayer ? "Player" : `#${ev.objectId}`), level: e?.level, hp: e?.hp, maxHp: e?.maxHp, dead: e?.dead });
          break;
        }
        case "target-unselected":
          setTarget((t) => (t && t.objectId === ev.objectId ? null : t));
          break;
        case "status-update":
          setTarget((t) => (t && t.objectId === ev.objectId ? { ...t, hp: ev.hp ?? t.hp, maxHp: ev.maxHp ?? t.maxHp, level: ev.level ?? t.level } : t));
          break;
        case "die":
          setTarget((t) => (t && t.objectId === ev.objectId ? { ...t, dead: true, hp: 0 } : t));
          break;
        case "attack": {
          const myId = conn.getPlayer?.()?.objectId;
          const involved = ev.targetId === target?.objectId || ev.attackerId === myId || ev.targetId === myId;
          if (involved) {
            const id = ++floatId.current;
            const text = ev.miss ? "Miss" : String(ev.damage);
            setFloats((f) => [...f.slice(-8), { id, text, crit: ev.crit }]);
            setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 1100);
          }
          break;
        }
        case "chat":
          setFeed((c) => [...c.slice(-200), { color: chatColor(ev.channel), text: `${ev.sender}: ${ev.text}` }]);
          break;
        case "system-message":
          setFeed((c) => [...c.slice(-200), { color: "#b6a98a", text: ev.text }]);
          break;
        case "skill-list":
          setSkills(ev.skills);
          break;
        case "html":
          setHtmlWnd({ html: ev.html });
          break;
      }
    });
    return off;
  }, [target?.objectId]);

  // vitals: live protocol state wins, else the activeChar snapshot from /world
  const name = live.name ?? activeChar?.name ?? "—";
  const level = live.level ?? activeChar?.level ?? 1;
  const hp = live.hp ?? activeChar?.hp ?? 0;
  const hpMax = Math.max(live.maxHp ?? activeChar?.hpMax ?? 0, hp, 1);
  const mp = live.mp ?? activeChar?.mp ?? 0;
  const mpMax = Math.max(live.maxMp ?? activeChar?.mpMax ?? 0, mp, 1);
  const cp = live.cp ?? activeChar?.cp ?? 0;
  const cpMax = Math.max(live.maxCp ?? activeChar?.cpMax ?? 0, cp, 1);
  const expPct = activeChar?.expPct ?? 0;

  const lines = [...(chatLines ?? []), ...feed];

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

      {/* ───── Target window (top-center, when a target is selected) ───── */}
      {target && (
        <div style={{ position: "absolute", left: "50%", top: 6, transform: "translateX(-50%)", width: 200, pointerEvents: "auto" }}>
          <div style={{ position: "relative", padding: "3px 6px 5px", background: "linear-gradient(180deg,rgba(28,26,20,.92),rgba(14,12,9,.92))", border: "1px solid #4a4030", borderRadius: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: target.dead ? "#9a9a9a" : "#f0e2b8", textShadow: "0 1px 1px #000" }}>
                {target.name}{target.level ? ` (Lv ${target.level})` : ""}{target.dead ? " — Dead" : ""}
              </span>
              <button onClick={() => setTarget(null)} title="Clear target"
                style={{ width: 14, height: 14, fontSize: 9, lineHeight: 1, color: "#cbbf9c", background: "transparent", border: "1px solid #5a4a2a", borderRadius: 2, cursor: "pointer" }}>×</button>
            </div>
            <Gauge kind="HP" cur={target.hp} max={target.maxHp} w={188} h={12}
                   label={target.maxHp ? `${fmt(target.hp)} / ${fmt(target.maxHp)}` : (target.hp != null ? fmt(target.hp) : "")} />
            {/* floating combat numbers */}
            <div style={{ position: "absolute", left: 0, right: 0, top: -4, height: 0, pointerEvents: "none" }}>
              {floats.map((f, i) => (
                <span key={f.id} style={{ position: "absolute", left: `${30 + ((i % 5) * 12)}%`, top: 0, fontSize: f.crit ? 18 : 14, fontWeight: 800,
                  color: f.text === "Miss" ? "#cfcfcf" : f.crit ? "#ff5a4a" : "#ffd24a", textShadow: "0 1px 2px #000",
                  animation: "l2dmg 1.1s ease-out forwards" }}>{f.crit && f.text !== "Miss" ? `${f.text}!` : f.text}</span>
              ))}
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes l2dmg{0%{opacity:0;transform:translateY(6px) scale(.8)}15%{opacity:1}100%{opacity:0;transform:translateY(-26px) scale(1.1)}}`}</style>

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
        <input
          value={chatText}
          onChange={(e) => setChatText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submitChat(); }}
          placeholder="Press Enter to chat ( // = GM command )"
          style={{ marginTop: 3, width: "100%", boxSizing: "border-box", height: 20, padding: "0 6px", fontSize: 11,
                   color: "#f3ecd2", background: "rgba(8,10,8,.55)", border: "1px solid #4a4030", borderRadius: 3, outline: "none" }}
        />
      </div>

      {/* ───── EXP bar (very bottom, full width) ───── */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 8, pointerEvents: "auto" }}>
        <Gauge kind="EXP" cur={expPct} w={1024} h={8} showText={false} />
      </div>

      {/* ───── Open game windows (Inventory / Skills / Map / …) ───── */}
      {openWindows.map((k) =>
        k === "skills" ? (
          <SkillsPanel key={k} skills={skills} onClose={() => closeWindow(k)} />
        ) : (
          <div key={k} style={{ pointerEvents: "auto" }}>
            <L2XdatWindow windowKey={k} onClose={() => closeWindow(k)} />
          </div>
        )
      )}

      {/* ───── Server HTML window (NPC dialogs + GM/admin panel) ───── */}
      {htmlWnd && (
        <L2HtmlWindow
          html={htmlWnd.html}
          title="Menu"
          onBypass={(cmd) => bypass(cmd)}
          onClose={() => setHtmlWnd(null)}
        />
      )}

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
