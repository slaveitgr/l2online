/**
 * Authentic L2 Superion in-game HUD - rendered with real client sprites
 * extracted from SysTextures/*.utx via the L2Sprite primitives.
 *
 * Mount once under a SpriteProvider:
 *   <SpriteProvider><L2HudAuthentic uiScale={1.35}/></SpriteProvider>
 */
import { useEffect, useState, type CSSProperties } from "react";
import { getGameConnection, type GameEvent, type PlayerState } from "@/lib/l2-protocol/game-client";
import { L2Frame, L2Slot, L2Sprite } from "@/components/hud/L2Sprite";
import { L2Gauge } from "@/components/hud/L2Gauge";
import { L2SystemMenu } from "@/components/hud/L2SystemMenu";
import { L2SettingsWindow, L2CalendarWindow, L2ExitDialog } from "@/components/hud/L2GameWindows";

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

interface L2HudAuthenticProps {
  uiScale?: number;
  activeChar?: HudActiveChar;
  chatLines?: HudChatLine[];
  onExit?: () => void;
  onSendChat?: (text: string) => void;
}

const RIGHT_ICONS = ["⚔", "🛡", "✦", "📖", "🗺", "👥", "🏆", "♥", "◆", "📦", "★", "⚙"];
const DEFAULT_CHAT: HudChatLine[] = [
  { color: "#5a9ad8", text: "http://www.l2jmobius.org/" },
  { color: "#6cae5a", text: "Balthus Festival: Event ongoing!" },
  { color: "#d8c25a", text: "You have entered the world." },
];

function ratio(cur = 0, max = 0) {
  return max > 0 ? Math.max(0, Math.min(1, cur / max)) : 0;
}

function expRatio(value = 0) {
  const normalized = value > 1 ? value / 100 : value;
  return Math.max(0, Math.min(1, normalized));
}

export function L2HudAuthentic({
  uiScale = 1.35,
  activeChar,
  chatLines,
  onExit,
}: L2HudAuthenticProps) {
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [hp, setHp] = useState({ cur: activeChar?.hp ?? 1, max: activeChar?.hpMax ?? activeChar?.hp ?? 1 });
  const [mp, setMp] = useState({ cur: activeChar?.mp ?? 1, max: activeChar?.mpMax ?? activeChar?.mp ?? 1 });
  const [cp, setCp] = useState({ cur: activeChar?.cp ?? 0, max: activeChar?.cpMax ?? activeChar?.cp ?? 1 });
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeWindow, setActiveWindow] = useState<"settings" | "calendar" | null>(null);
  const [exitOpen, setExitOpen] = useState(false);

  // Toggle the system menu with the X key, like the real client.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "x" && !(e.target as HTMLElement)?.matches?.("input,textarea")) setMenuOpen((v) => !v);
      if (e.key === "Escape") { setMenuOpen(false); setActiveWindow(null); setExitOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleMenu = (key: string) => {
    if (key === "settings") { setActiveWindow("settings"); setMenuOpen(false); }
    else if (key === "calendar") { setActiveWindow("calendar"); setMenuOpen(false); }
    else if (key === "characters" || key === "exit") { setExitOpen(true); setMenuOpen(false); }
    else setMenuOpen(false);
  };

  useEffect(() => {
    if (!activeChar) return;
    setHp({ cur: activeChar.hp ?? 1, max: activeChar.hpMax ?? activeChar.hp ?? 1 });
    setMp({ cur: activeChar.mp ?? 1, max: activeChar.mpMax ?? activeChar.mp ?? 1 });
    setCp({ cur: activeChar.cp ?? 0, max: activeChar.cpMax ?? activeChar.cp ?? 1 });
  }, [activeChar]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("l2.activeChar");
      if (raw) {
        const c = JSON.parse(raw);
        setPlayer((p) => p ?? ({ name: c.name, level: c.level, hp: 1, mp: 1, x: 0, y: 0, z: 0, objectId: 0, classId: 0, raceId: 0 } as PlayerState));
      }
    } catch {
      /* ignore */
    }
    const conn = getGameConnection();
    const p0 = conn?.getPlayer?.();
    if (p0) {
      setPlayer(p0);
      setHp({ cur: p0.hp, max: p0.hp || 1 });
      setMp({ cur: p0.mp, max: p0.mp || 1 });
    }
    const off = conn?.addListener?.((ev: GameEvent) => {
      if (ev.type === "player") {
        setPlayer(ev.player);
        setHp((s) => ({ cur: ev.player.hp, max: Math.max(s.max, ev.player.hp || 1) }));
        setMp((s) => ({ cur: ev.player.mp, max: Math.max(s.max, ev.player.mp || 1) }));
      } else if (ev.type === "char-selected") {
        setPlayer((p) => ({ ...(p ?? ({} as PlayerState)), name: ev.name, objectId: ev.objectId, x: ev.x, y: ev.y, z: ev.z } as PlayerState));
      }
    });
    return () => {
      off?.();
    };
  }, []);

  const name = activeChar?.name ?? player?.name ?? "Hero";
  const level = activeChar?.level ?? player?.level ?? 1;
  const exp = expRatio(activeChar?.expPct ?? 0);
  const visibleChat = chatLines?.length ? chatLines : DEFAULT_CHAT;
  const corner = (style: CSSProperties, origin: string): CSSProperties => ({ position: "absolute", transform: `scale(${uiScale})`, transformOrigin: origin, ...style });

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 40, fontFamily: "Tahoma, Geneva, sans-serif", fontSize: 11, color: "#cfc6b0" }}>
      <L2Frame style={{ ...corner({ left: 6, top: 6, width: 210 }, "top left"), display: "flex", padding: 4 }}>
        <div style={{ flex: 1, padding: "2px 4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#e6dcc0" }}>
            <span style={{ color: "#c9a04a" }}>{level}</span>
            <span>{name}</span>
            <span style={{ marginLeft: "auto", color: "#8a8270" }}>▾</span>
          </div>
          <div style={{ marginTop: 3, display: "flex", flexDirection: "column", gap: 2 }}>
            <L2Gauge kind="CP" value={ratio(cp.cur, cp.max)} width={188} height={13} label="CP" num={`${cp.cur | 0}/${cp.max | 0}`} />
            <L2Gauge kind="HP" value={ratio(hp.cur, hp.max)} width={188} height={13} label="HP" num={`${hp.cur | 0}/${hp.max | 0}`} />
            <L2Gauge kind="MP" value={ratio(mp.cur, mp.max)} width={188} height={13} label="MP" num={`${mp.cur | 0}/${mp.max | 0}`} />
          </div>
        </div>
        <div style={{ width: 34, display: "flex", flexDirection: "column", gap: 2, padding: 2 }}>
          <div style={{ width: 30, height: 30, border: "1px solid #5a4a2a", background: "#0c0c0a", borderRadius: "50%" }} />
        </div>
      </L2Frame>

      <div style={{ ...corner({ right: 4, top: 40, display: "flex", flexDirection: "column", gap: 7 }, "top right") }}>
        {RIGHT_ICONS.map((ic, i) => (
          <div key={i} style={{ width: 26, height: 26, lineHeight: "26px", textAlign: "center", fontSize: 15, color: "#b5a273" }}>{ic}</div>
        ))}
      </div>

      <div style={{ ...corner({ left: 8, bottom: 40, width: 380, fontSize: 12, lineHeight: 1.5 }, "bottom left") }}>
        {visibleChat.slice(-8).map((l, i) => (
          <div key={i} style={{ color: l.color ?? "#cfc6b0", textShadow: "0 1px 1px #000" }}>{l.text}</div>
        ))}
      </div>

      <div style={{ ...corner({ left: "50%", bottom: 26, display: "flex", alignItems: "flex-end", gap: 4 }, "bottom center"), transform: `translateX(-50%) scale(${uiScale})` }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginRight: 2, fontSize: 10, color: "#8a8270" }}>
          <span>▲ 1</span><span>▼ 2</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {[0, 1].map((row) => (
            <div key={row} style={{ display: "flex", gap: 2 }}>
              {Array.from({ length: 12 }).map((_, i) => (
                <L2Slot key={i} size={34} refId="L2UI_NewTex.ShotcutWnd_SlotBG">
                  {row === 1 && <span style={{ position: "absolute", top: 0, left: 2, fontSize: 9, color: "#cfc6b0", textShadow: "0 1px 1px #000" }}>{(i + 1) % 10}</span>}
                </L2Slot>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...corner({ right: 8, bottom: 30, display: "flex", gap: 5, alignItems: "center", fontSize: 17, color: "#b5a273" }, "bottom right") }}>
        {["♻", "⚒", "🎒", "📖", "✉"].map((ic, i) => <span key={i}>{ic}</span>)}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          title="System Menu (X)"
          style={{ pointerEvents: "auto", background: "none", border: "none", color: menuOpen ? "#e6c87a" : "#b5a273", fontSize: 17, cursor: "pointer", lineHeight: 1 }}
        >
          ☰
        </button>
      </div>

      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 20 * uiScale, background: "linear-gradient(180deg,#15130f,#0c0b08)", borderTop: "1px solid #4a4236", display: "flex", alignItems: "center", padding: "0 8px", gap: 12, fontSize: 10 * uiScale, color: "#b5a273" }}>
        <span>EXP</span>
        <div style={{ flex: 1, height: 9 }}>
          <L2Gauge kind="EXP" value={exp} width={9999} height={9} />
        </div>
        <span style={{ color: "#cfc6b0" }}>{(exp * 100).toFixed(4)}%</span>
        <span style={{ color: "#c9a04a" }}>200%</span>
        <span style={{ color: "#8a8270" }}>Clan · OFF</span>
        <span style={{ marginLeft: "auto", color: "#c9a04a" }}>27/250</span>
      </div>

      <span style={{ display: "none" }}><L2Sprite refId="L2UI_CT1.Divider_DF" /></span>

      {/* in-game windows */}
      <L2SystemMenu open={menuOpen} onClose={() => setMenuOpen(false)} onSelect={handleMenu} />
      {activeWindow === "settings" && <L2SettingsWindow onClose={() => setActiveWindow(null)} />}
      {activeWindow === "calendar" && <L2CalendarWindow onClose={() => setActiveWindow(null)} />}
      {exitOpen && <L2ExitDialog onExit={() => { setExitOpen(false); onExit?.(); }} onCancel={() => setExitOpen(false)} />}
    </div>
  );
}
