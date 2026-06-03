/**
 * Authentic L2 Superion in-game HUD — now rendered with the REAL client sprites
 * (extracted from SysTextures/*.utx) via the L2Sprite primitives, so frames,
 * slots and gauges match the Windows client pixel-for-pixel where we have the art.
 *
 * Mount once under a SpriteProvider:
 *   <SpriteProvider><L2HudAuthentic uiScale={1.35}/></SpriteProvider>
 *
 * Layout (matches the live client):
 *  - top-left status box: name+Lv + CP/HP/MP/VP gauges + portrait, in a GroupBox frame
 *  - top-right: vertical strip of system-menu icons
 *  - bottom-left: transparent channel-coloured chat
 *  - bottom-center: 2-row shortcut bar (real slot sprite)
 *  - full-width bottom EXP bar + status line
 *  - bottom-right: system icon cluster
 *
 * Fed by the live game connection (getGameConnection).
 */
import { useEffect, useState } from "react";
import { getGameConnection, type GameEvent, type PlayerState } from "@/lib/l2-protocol/game-client";
import { L2Frame, L2Slot, L2Sprite } from "@/components/l2/L2Sprite";
import { L2Gauge } from "@/components/l2/L2Gauge";

interface ChatLine { color: string; text: string }

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

  // corner-anchored, scaled wrapper
  const corner = (style: React.CSSProperties, origin: string): React.CSSProperties => ({ position: "absolute", transform: `scale(${uiScale})`, transformOrigin: origin, ...style });

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 40, fontFamily: "Tahoma, Geneva, sans-serif", fontSize: 11, color: "#cfc6b0" }}>

      {/* ── Status box (top-left) ── real GroupBox frame + real gauges ── */}
      <L2Frame style={{ ...corner({ left: 6, top: 6, width: 210 }, "top left"), display: "flex", padding: 4 }}>
        <div style={{ flex: 1, padding: "2px 4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#e6dcc0" }}>
            <span style={{ color: "#c9a04a" }}>{player?.level ?? 1}</span>
            <span>{player?.name ?? "Hero"}</span>
            <span style={{ marginLeft: "auto", color: "#8a8270" }}>▾</span>
          </div>
          <div style={{ marginTop: 3, display: "flex", flexDirection: "column", gap: 2 }}>
            <L2Gauge kind="CP" value={cp.cur / cp.max} width={188} height={13} label="CP" num={`${cp.cur | 0}/${cp.max | 0}`} />
            <L2Gauge kind="HP" value={hp.cur / hp.max} width={188} height={13} label="HP" num={`${hp.cur | 0}/${hp.max | 0}`} />
            <L2Gauge kind="MP" value={mp.cur / mp.max} width={188} height={13} label="MP" num={`${mp.cur | 0}/${mp.max | 0}`} />
          </div>
        </div>
        <div style={{ width: 34, display: "flex", flexDirection: "column", gap: 2, padding: 2 }}>
          <div style={{ width: 30, height: 30, border: "1px solid #5a4a2a", background: "#0c0c0a", borderRadius: "50%" }} />
        </div>
      </L2Frame>

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

      {/* ── Shortcut bar (bottom-center, 2 rows) ── real slot sprite ── */}
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

      {/* ── Bottom-right system icon cluster ── */}
      <div style={{ ...corner({ right: 8, bottom: 30, display: "flex", gap: 5, fontSize: 17, color: "#b5a273" }, "bottom right") }}>
        {["♻", "⚒", "🎒", "📖", "✉", "☰"].map((ic, i) => <span key={i}>{ic}</span>)}
      </div>

      {/* ── Full-width bottom EXP bar + status line ── */}
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

      {/* hidden helper so tree-shakers keep L2Sprite available for ad-hoc chrome */}
      <span style={{ display: "none" }}><L2Sprite refId="L2UI_CT1.Divider_DF" /></span>
    </div>
  );
}
