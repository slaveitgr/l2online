/**
 * Authentic L2 Superion in-game HUD — rebuilt from real client screenshots.
 *
 * Faithful layout (matches the live client):
 *  - top-left compact status box: name+Lv, 4 stacked bars CP(gold)/HP(red)/MP(blue)/VP(green)
 *    with numeric values, + round portrait
 *  - right edge: vertical strip of system-menu category icons
 *  - bottom-left: TRANSPARENT chat (text only, colored by channel)
 *  - bottom-center: 2-row shortcut bar (12 slots each) + row chevrons + left action buttons
 *  - full-width bottom EXP bar (thin green) + status line (exp%, rate, clan, weight)
 *  - bottom-right: system icon cluster
 *  - red nameplate over the character
 *
 * Fed by the live game connection (getGameConnection). Drop into /world:
 *   <L2HudAuthentic />
 *
 * Note: this uses faithful CSS for the frames/bars. For pixel-perfect fidelity,
 * swap the bar/frame backgrounds for the real client textures once P8/palette
 * decoding is added to readTexture (StatusBar gauges live in L2UI_CT1.utx).
 */
import { useEffect, useState } from "react";
import { getGameConnection, type GameEvent, type PlayerState } from "@/lib/l2-protocol/game-client";

const REF_W = 1920;
const REF_H = 1080;

interface ChatLine { color: string; text: string }

function Bar({ label, value, max, from, to, num, textDark, h = 9 }: { label: string; value: number; max: number; from: string; to: string; num?: string; textDark?: boolean; h?: number }) {
  const pct = Math.max(0, Math.min(1, max ? value / max : 0)) * 100;
  return (
    <div style={{ position: "relative", height: h, background: "#0a0a08", border: "1px solid #2a261e", marginBottom: 1 }}>
      <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(180deg, ${from}, ${to})` }} />
      <span style={{ position: "absolute", left: 3, top: -1, fontSize: 8, fontWeight: 700, color: textDark ? "#000" : "#fff", textShadow: textDark ? "none" : "0 1px 0 #000" }}>{label}</span>
      {num && <span style={{ position: "absolute", right: 3, top: -1, fontSize: 8, color: "#fff", textShadow: "0 1px 0 #000" }}>{num}</span>}
    </div>
  );
}

const RIGHT_ICONS = ["⚔", "🛡", "✦", "📖", "🗺", "👥", "🏆", "♥", "◆", "📦", "★", "⚙"];

export function L2HudAuthentic() {
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [hp, setHp] = useState({ cur: 1, max: 1 });
  const [mp, setMp] = useState({ cur: 1, max: 1 });
  const [cp] = useState({ cur: 1, max: 1 });
  const [exp, setExp] = useState(0); // 0..1 within level
  const [chat, setChat] = useState<ChatLine[]>([
    { color: "#5a9ad8", text: "http://www.l2jmobius.org/" },
    { color: "#6cae5a", text: "Balthus Festival: Event ongoing!" },
    { color: "#d8c25a", text: "You have entered the world." },
  ]);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / REF_W, window.innerHeight / REF_H));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("l2.activeChar");
      if (raw) {
        const c = JSON.parse(raw);
        setPlayer((p) => p ?? ({ name: c.name, level: c.level, hp: 1, mp: 1, x: 0, y: 0, z: 0, objectId: 0, classId: 0, raceId: 0 } as PlayerState));
      }
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
      // TODO SAY2(0x4A) → setChat; StatusUpdate → exp/cp; UserInfo → maxHp/maxMp
    });
    return () => { off?.(); };
  }, []);

  const frame: React.CSSProperties = { background: "linear-gradient(180deg,#1e1c18,#15130f)", border: "1px solid #4a4236", boxShadow: "0 0 0 1px #000" };

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 40, fontFamily: "Tahoma, Geneva, sans-serif" }}>
      <div style={{ position: "absolute", inset: 0, transform: `scale(${scale})`, transformOrigin: "top left", width: REF_W, height: REF_H }}>

        {/* ── Status box (top-left) ── */}
        <div style={{ position: "absolute", left: 6, top: 6, width: 208, ...frame, display: "flex" }}>
          <div style={{ flex: 1, padding: "2px 5px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#e6dcc0" }}>
              <span style={{ color: "#c9a04a" }}>{player?.level ?? 1}</span>
              <span>{player?.name ?? "Hero"}</span>
              <span style={{ marginLeft: "auto", color: "#8a8270" }}>▾</span>
            </div>
            <div style={{ marginTop: 2 }}>
              <Bar label="CP" value={cp.cur} max={cp.max} from="#e8c84a" to="#b8902a" num={`${cp.cur | 0}/${cp.max | 0}`} textDark />
              <Bar label="HP" value={hp.cur} max={hp.max} from="#d83a3a" to="#9a1818" num={`${hp.cur | 0}/${hp.max | 0}`} />
              <Bar label="MP" value={mp.cur} max={mp.max} from="#3a6ad8" to="#18389a" num={`${mp.cur | 0}/${mp.max | 0}`} />
              <Bar label="VP" value={0} max={1} from="#4a8a3a" to="#2a5a1a" h={7} />
            </div>
          </div>
          <div style={{ width: 34, display: "flex", flexDirection: "column", gap: 2, padding: 3 }}>
            <div style={{ width: 28, height: 28, border: "1px solid #5a4a2a", background: "#0c0c0a", borderRadius: "50%" }} />
            <div style={{ width: 28, height: 14, border: "1px solid #4a4236", background: "#0c0c0a" }} />
          </div>
        </div>

        {/* ── Right-edge system menu icon strip ── */}
        <div style={{ position: "absolute", right: 4, top: 34, display: "flex", flexDirection: "column", gap: 6 }}>
          {RIGHT_ICONS.map((ic, i) => (
            <div key={i} style={{ width: 24, height: 24, lineHeight: "24px", textAlign: "center", fontSize: 14, color: "#b5a273" }}>{ic}</div>
          ))}
        </div>

        {/* ── Transparent chat (bottom-left) ── */}
        <div style={{ position: "absolute", left: 8, bottom: 54, width: 360, fontSize: 11, lineHeight: 1.45 }}>
          {chat.map((l, i) => (
            <div key={i} style={{ color: l.color, textShadow: "0 1px 1px #000" }}>{l.text}</div>
          ))}
        </div>

        {/* ── Shortcut bar (bottom-center, 2 rows) ── */}
        <div style={{ position: "absolute", left: "50%", bottom: 24, transform: "translateX(-50%)", display: "flex", alignItems: "flex-end", gap: 4 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginRight: 2, fontSize: 9, color: "#8a8270" }}>
            <span>▲ 1</span><span>▼ 2</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {[0, 1].map((row) => (
              <div key={row} style={{ display: "flex", gap: 2 }}>
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} style={{ width: 32, height: 32, background: "#161410", border: "1px solid #3a342a", position: "relative" }}>
                    {row === 1 && <span style={{ position: "absolute", top: 0, left: 2, fontSize: 8, color: "#7a7058" }}>{(i + 1) % 10}</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* ── Bottom-right system icon cluster ── */}
        <div style={{ position: "absolute", right: 8, bottom: 28, display: "flex", gap: 4, fontSize: 16, color: "#b5a273" }}>
          {["♻", "⚒", "🎒", "📖", "✉", "☰"].map((ic, i) => <span key={i}>{ic}</span>)}
        </div>

        {/* ── Full-width bottom EXP bar + status line ── */}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 18, background: "linear-gradient(180deg,#15130f,#0c0b08)", borderTop: "1px solid #4a4236", display: "flex", alignItems: "center", padding: "0 8px", gap: 12, fontSize: 10, color: "#b5a273" }}>
          <span>EXP</span>
          <div style={{ flex: 1, height: 7, background: "#0a0a08", border: "1px solid #2a261e", position: "relative" }}>
            <div style={{ width: `${(exp * 100).toFixed(2)}%`, height: "100%", background: "linear-gradient(180deg,#7ad84a,#3a8a1a)" }} />
          </div>
          <span style={{ color: "#cfc6b0" }}>{(exp * 100).toFixed(4)}%</span>
          <span style={{ color: "#c9a04a" }}>200%</span>
          <span style={{ color: "#8a8270" }}>Clan · OFF</span>
          <span style={{ marginLeft: "auto", color: "#c9a04a" }}>27/250</span>
        </div>

      </div>
    </div>
  );
}
