/**
 * Authentic L2 Superion in-game HUD — rebuilt from real client screenshots.
 *
 * Each window is anchored to its screen corner and scaled by UI_SCALE (like the
 * client's "UI scale" option), so it stays put and is readable at any viewport.
 *
 * Layout (matches the live client):
 *  - top-left compact status box: name+Lv + 4 stacked bars CP/HP/MP/VP (numeric) + portrait
 *  - top-right: vertical strip of system-menu category icons
 *  - bottom-left: TRANSPARENT chat (text only, channel-coloured)
 *  - bottom-center: 2-row shortcut bar (12 slots each) + row chevrons
 *  - full-width bottom EXP bar + status line
 *  - bottom-right: system icon cluster
 *
 * Fed by the live game connection (getGameConnection). Drop into /world:
 *   <L2HudAuthentic uiScale={1.35} />
 */
import { useEffect, useState } from "react";
import { getGameConnection, type GameEvent, type PlayerState } from "@/lib/l2-protocol/game-client";

interface ChatLine { color: string; text: string }

function Bar({ label, value, max, from, to, num, textDark, h = 11 }: { label: string; value: number; max: number; from: string; to: string; num?: string; textDark?: boolean; h?: number }) {
  const pct = Math.max(0, Math.min(1, max ? value / max : 0)) * 100;
  return (
    <div style={{ position: "relative", height: h, background: "#0a0a08", border: "1px solid #2a261e", marginBottom: 1 }}>
      <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(180deg, ${from}, ${to})` }} />
      <span style={{ position: "absolute", left: 4, top: 0, lineHeight: `${h}px`, fontSize: 9, fontWeight: 700, color: textDark ? "#000" : "#fff", textShadow: textDark ? "none" : "0 1px 0 #000" }}>{label}</span>
      {num && <span style={{ position: "absolute", right: 4, top: 0, lineHeight: `${h}px`, fontSize: 9, color: "#fff", textShadow: "0 1px 0 #000" }}>{num}</span>}
    </div>
  );
}

const RIGHT_ICONS = ["⚔", "🛡", "✦", "📖", "🗺", "👥", "🏆", "♥", "◆", "📦", "★", "⚙"];

export function L2HudAuthentic({ uiScale = 1.35 }: { uiScale?: number }) {
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [hp, setHp] = useState({ cur: 1, max: 1 });
  const [mp, setMp] = useState({ cur: 1, max: 1 });
  const [cp] = useState({ cur: 1, max: 1 });
  const [exp] = useState(0);
  const [chat] = useState<ChatLine[]>([
    { color: "#5a9ad8", text: "http://www.l2jmobius.org/" },
    { color: "#6cae5a", text: "Balthus Festival: Event ongoing!" },
    { color: "#d8c25a", text: "You have entered the world." },
  ]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("l2.activeChar");
      if (raw) { const c = JSON.parse(raw); setPlayer((p) => p ?? ({ name: c.name, level: c.level, hp: 1, mp: 1, x: 0, y: 0, z: 0, objectId: 0, classId: 0, raceId: 0 } as PlayerState)); }
    } catch { /* ignore */ }
    const conn = getGameConnection();
    const p0 = conn?.getPlayer?.();
    if (p0) { setPlayer(p0); setHp({ cur: p0.hp, max: p0.hp || 1 }); setMp({ cur: p0.mp, max: p0.mp || 1 }); }
    const off = conn?.addListener?.((ev: GameEvent) => {
      if (ev.type === "player") {
        setPlayer(ev.player);
        setHp((s) => ({ cur: ev.player.hp, max: Math.max(s.max, ev.player.hp || 1) }));
        setMp((s) => ({ cur: ev.player.mp, max: Math.max(s.max, ev.player.mp || 1) }));
      } else if (ev.type === "char-selected") {
        setPlayer((p) => ({ ...(p ?? ({} as PlayerState)), name: ev.name, objectId: ev.objectId, x: ev.x, y: ev.y, z: ev.z } as PlayerState));
      }
    });
    return () => { off?.(); };
  }, []);

  const frame: React.CSSProperties = { background: "linear-gradient(180deg,#1e1c18,#15130f)", border: "1px solid #4a4236", boxShadow: "0 0 0 1px #000" };
  // corner-anchored, scaled wrapper
  const corner = (style: React.CSSProperties, origin: string): React.CSSProperties => ({ position: "absolute", transform: `scale(${uiScale})`, transformOrigin: origin, ...style });

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 40, fontFamily: "Tahoma, Geneva, sans-serif", fontSize: 11, color: "#cfc6b0" }}>

      {/* ── Status box (top-left) ── */}
      <div style={{ ...corner({ left: 6, top: 6, width: 208 }, "top left"), ...frame, display: "flex" }}>
        <div style={{ flex: 1, padding: "3px 5px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#e6dcc0" }}>
            <span style={{ color: "#c9a04a" }}>{player?.level ?? 1}</span>
            <span>{player?.name ?? "Hero"}</span>
            <span style={{ marginLeft: "auto", color: "#8a8270" }}>▾</span>
          </div>
          <div style={{ marginTop: 3 }}>
            <Bar label="CP" value={cp.cur} max={cp.max} from="#e8c84a" to="#b8902a" num={`${cp.cur | 0}/${cp.max | 0}`} textDark />
            <Bar label="HP" value={hp.cur} max={hp.max} from="#d83a3a" to="#9a1818" num={`${hp.cur | 0}/${hp.max | 0}`} />
            <Bar label="MP" value={mp.cur} max={mp.max} from="#3a6ad8" to="#18389a" num={`${mp.cur | 0}/${mp.max | 0}`} />
            <Bar label="VP" value={0} max={1} from="#4a8a3a" to="#2a5a1a" h={8} />
          </div>
        </div>
        <div style={{ width: 36, display: "flex", flexDirection: "column", gap: 2, padding: 3 }}>
          <div style={{ width: 30, height: 30, border: "1px solid #5a4a2a", background: "#0c0c0a", borderRadius: "50%" }} />
          <div style={{ width: 30, height: 14, border: "1px solid #4a4236", background: "#0c0c0a" }} />
        </div>
      </div>

      {/* ── Right-edge system menu icon strip ── */}
      <div style={{ ...corner({ right: 4, top: 40, display: "flex", flexDirection: "column", gap: 7 }, "top right") }}>
        {RIGHT_ICONS.map((ic, i) => (
          <div key={i} style={{ width: 26, height: 26, lineHeight: "26px", textAlign: "center", fontSize: 15, color: "#b5a273" }}>{ic}</div>
        ))}
      </div>

      {/* ── Transparent chat (bottom-left) ── */}
      <div style={{ ...corner({ left: 8, bottom: 40, width: 380, fontSize: 12, lineHeight: 1.5 }, "bottom left") }}>
        {chat.map((l, i) => (<div key={i} style={{ color: l.color, textShadow: "0 1px 1px #000" }}>{l.text}</div>))}
      </div>

      {/* ── Shortcut bar (bottom-center, 2 rows) ── */}
      <div style={{ ...corner({ left: "50%", bottom: 26, display: "flex", alignItems: "flex-end", gap: 4 }, "bottom center"), transform: `translateX(-50%) scale(${uiScale})` }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginRight: 2, fontSize: 10, color: "#8a8270" }}>
          <span>▲ 1</span><span>▼ 2</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {[0, 1].map((row) => (
            <div key={row} style={{ display: "flex", gap: 2 }}>
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} style={{ width: 34, height: 34, background: "#161410", border: "1px solid #3a342a", position: "relative" }}>
                  {row === 1 && <span style={{ position: "absolute", top: 0, left: 2, fontSize: 9, color: "#7a7058" }}>{(i + 1) % 10}</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── Bottom-right system icon cluster ── */}
      <div style={{ ...corner({ right: 8, bottom: 30, display: "flex", gap: 5, fontSize: 17, color: "#b5a273" }, "bottom right") }}>
        {["♻", "⚒", "🎒", "📖", "✉", "☰"].map((ic, i) => <span key={i}>{ic}</span>)}
      </div>

      {/* ── Full-width bottom EXP bar + status line ── */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 20 * uiScale, background: "linear-gradient(180deg,#15130f,#0c0b08)", borderTop: "1px solid #4a4236", display: "flex", alignItems: "center", padding: "0 8px", gap: 12, fontSize: 10 * uiScale, color: "#b5a273" }}>
        <span>EXP</span>
        <div style={{ flex: 1, height: 8, background: "#0a0a08", border: "1px solid #2a261e", position: "relative" }}>
          <div style={{ width: `${(exp * 100).toFixed(2)}%`, height: "100%", background: "linear-gradient(180deg,#7ad84a,#3a8a1a)" }} />
        </div>
        <span style={{ color: "#cfc6b0" }}>{(exp * 100).toFixed(4)}%</span>
        <span style={{ color: "#c9a04a" }}>200%</span>
        <span style={{ color: "#8a8270" }}>Clan · OFF</span>
        <span style={{ marginLeft: "auto", color: "#c9a04a" }}>27/250</span>
      </div>

    </div>
  );
}
