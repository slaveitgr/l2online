/**
 * L2CharSelectScreen — the real Lineage II "Select Character" screen, rebuilt 1:1
 * from a reference screenshot of the Superion client (no mock overlay):
 *   - title top-left
 *   - 3D character centred over the Aden cathedral background
 *   - right-hand slot list: gold-framed filled card + empty "+" slots (7 total)
 *   - bottom-centre stat panel: name/class, HP+MP row, VP, XP, SP/Rep, < > arrows
 *   - Credits/Exit (bottom-left), Play (bottom-centre), Create/Delete (bottom-right)
 *
 * Everything is positioned as % of a 1920x1080 frame inside a centred 16:9 stage,
 * so it scales to any window while keeping the exact proportions of the original.
 */
import type { ReactNode, CSSProperties } from "react";

const BG = "/hud/screens/CharSelect.png"; // real Aden cathedral background

export interface CharSlot {
  name: string;
  level: number;
  className?: string;  // class name (klass)
  className2?: string; // race
  hp?: number;
  mp?: number;
  sp?: number;
  expPercent?: number;
}

const GOLD = "#cda451";
const GOLD_BRIGHT = "#e6c87a";

function Bar({ color, w = "100%", value, label }: { color: string; w?: string; value?: string; label?: string }) {
  return (
    <div style={{ position: "relative", height: "100%", width: w, background: "linear-gradient(180deg,#0c0d10,#16181d)", border: "1px solid #000", boxSizing: "border-box" }}>
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, ${color} 0%, ${color} 45%, rgba(0,0,0,0.35) 100%)` }} />
      {value && (
        <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: label ? "flex-end" : "center", paddingRight: 4, fontSize: "0.62vw", color: "#fff", textShadow: "0 1px 1px #000", whiteSpace: "nowrap" }}>
          {value}
        </span>
      )}
    </div>
  );
}

/** Bottom-left / bottom-right small L2 button (flat dark + thin tan border). */
function L2Btn({ children, onClick, disabled, primary, style }: { children: ReactNode; onClick?: () => void; disabled?: boolean; primary?: boolean; style?: CSSProperties }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      style={{
        minWidth: "5vw", padding: "0.5vh 1vw", fontSize: "0.8vw", fontWeight: 700, letterSpacing: 0.5,
        color: disabled ? "#7a7058" : primary ? "#fff2cf" : "#d6c69c", cursor: disabled ? "default" : "pointer",
        background: primary ? "linear-gradient(180deg,#5a4a26,#322811)" : "linear-gradient(180deg,#23211b,#15130e)",
        border: `1px solid ${primary ? GOLD_BRIGHT : "#6f5f3c"}`, borderRadius: 3, textShadow: "0 1px 1px #000",
        boxShadow: "0 2px 5px rgba(0,0,0,.5)", ...style,
      }}>
      {children}
    </button>
  );
}

export function L2CharSelectScreen({
  characters = [],
  selected = 0,
  maxSlots = 7,
  onSelect,
  onStart,
  onCreate,
  onDelete,
  onBack,
  renderModel,
}: {
  characters?: CharSlot[];
  selected?: number;
  maxSlots?: number;
  onSelect?: (i: number) => void;
  onStart?: (i: number) => void;
  onCreate?: () => void;
  onDelete?: (i: number) => void;
  onBack?: () => void;
  renderModel?: (c: CharSlot | null) => ReactNode;
}) {
  const cur = characters[selected] ?? null;
  const fmt = (n = 0) => Math.round(n).toLocaleString("en-US");

  return (
    <div style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", background: "#05080a", overflow: "hidden", userSelect: "none", fontFamily: "'Segoe UI', Tahoma, sans-serif" }}>
      <section style={{ position: "relative", width: "min(100vw, calc(100vh * 16 / 9))", height: "min(100vh, calc(100vw * 9 / 16))", overflow: "hidden", background: "#0a0c10" }}>
        <img src={BG} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />

        {/* 3D character, centred over the ledge */}
        <div style={{ position: "absolute", left: "8%", bottom: "9%", width: "48%", top: "20%", display: "flex", alignItems: "flex-end", justifyContent: "center", pointerEvents: "none" }}>
          {renderModel ? renderModel(cur) : null}
        </div>

        {/* Title */}
        <div style={{ position: "absolute", left: "1.2%", top: "1.6%", fontSize: "1.6vw", fontWeight: 700, color: "#f2ecd8", textShadow: "0 2px 4px rgba(0,0,0,.8)", letterSpacing: 0.5 }}>
          Select Character
        </div>

        {/* ───── Right slot list ───── */}
        <div style={{ position: "absolute", right: "0.6%", top: "17.4%", width: "16.2%", display: "flex", flexDirection: "column", gap: "0.5%" }}>
          {Array.from({ length: maxSlots }).map((_, i) => {
            const c = characters[i];
            const isSel = i === selected && !!c;
            if (c) {
              return (
                <button key={i} type="button" onClick={() => onSelect?.(i)} onDoubleClick={() => onStart?.(i)}
                  style={{ display: "flex", alignItems: "stretch", gap: "6%", height: "5.2vw", padding: "0.5vw", cursor: "pointer", textAlign: "left",
                    background: "linear-gradient(180deg,rgba(35,30,18,.92),rgba(15,12,7,.92))",
                    border: `2px solid ${isSel ? GOLD : "#3a3322"}`, borderRadius: 3,
                    boxShadow: isSel ? `0 0 8px rgba(205,164,81,.45)` : "none" }}>
                  {/* portrait */}
                  <div style={{ width: "4.2vw", height: "100%", flex: "0 0 auto", border: `1px solid ${GOLD}`, borderRadius: 2, background: "radial-gradient(circle at 50% 35%, #5a4a3a, #161208 75%)" }} />
                  {/* texts */}
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <span style={{ fontSize: "0.95vw", fontWeight: 700, color: "#f2ecd8", textShadow: "0 1px 1px #000" }}>Lv.{c.level}</span>
                    </div>
                    <div style={{ fontSize: "0.7vw", color: "#b3ab98", textShadow: "0 1px 1px #000", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.className ?? ""}</div>
                    <div style={{ fontSize: "0.85vw", fontWeight: 700, color: GOLD, textShadow: "0 1px 1px #000", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                  </div>
                </button>
              );
            }
            return (
              <button key={i} type="button" onClick={() => onCreate?.()}
                style={{ height: "4.0vw", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  background: "linear-gradient(135deg,rgba(28,34,48,.62),rgba(16,20,30,.62) 60%,rgba(30,38,54,.62))",
                  border: "1px solid #2b3344", borderRadius: 2 }}>
                <span style={{ fontSize: "1.4vw", color: "#8a93a3", fontWeight: 300, textShadow: "0 1px 2px #000" }}>+</span>
              </button>
            );
          })}
        </div>

        {/* ───── Bottom-centre stat panel ───── */}
        {cur && (
          <div style={{ position: "absolute", left: "50%", bottom: "9.5%", transform: "translateX(-50%)", width: "33%", display: "flex", flexDirection: "column", alignItems: "center", color: "#cabf9b" }}>
            <div style={{ fontSize: "1.05vw", fontWeight: 700, color: GOLD, textShadow: "0 1px 2px #000" }}>{cur.name}</div>
            <div style={{ fontSize: "0.72vw", color: "#b3ab98", marginBottom: "0.5vh", textShadow: "0 1px 1px #000" }}>Lv.{cur.level} {cur.className ?? ""}</div>

            {/* arrows flanking the stat block */}
            <div style={{ position: "relative", width: "100%" }}>
              <button type="button" onClick={() => onSelect?.((selected - 1 + characters.length) % Math.max(1, characters.length))}
                style={{ position: "absolute", left: "-7%", top: 0, bottom: 0, border: 0, background: "transparent", color: GOLD, fontSize: "1.6vw", cursor: "pointer", textShadow: "0 1px 2px #000" }}>‹</button>
              <button type="button" onClick={() => onSelect?.((selected + 1) % Math.max(1, characters.length))}
                style={{ position: "absolute", right: "-7%", top: 0, bottom: 0, border: 0, background: "transparent", color: GOLD, fontSize: "1.6vw", cursor: "pointer", textShadow: "0 1px 2px #000" }}>›</button>

              {/* HP + MP row */}
              <div style={{ display: "grid", gridTemplateColumns: "1.6vw 1fr 1.6vw 1fr", alignItems: "center", columnGap: "0.3vw", height: "1.2vw", marginBottom: "0.35vh" }}>
                <span style={{ fontSize: "0.68vw" }}>HP</span>
                <Bar color="#cf3b2c" value={`${fmt(cur.hp)}/${fmt(cur.hp)}`} />
                <span style={{ fontSize: "0.68vw", textAlign: "center" }}>MP</span>
                <Bar color="#2f6fc6" value={`${fmt(cur.mp)}/${fmt(cur.mp)}`} />
              </div>
              {/* VP */}
              <div style={{ display: "grid", gridTemplateColumns: "1.6vw 1fr", alignItems: "center", columnGap: "0.3vw", height: "1.0vw", marginBottom: "0.35vh" }}>
                <span style={{ fontSize: "0.68vw" }}>VP</span>
                <div style={{ height: "100%" }}><Bar color="#4a9a3a" w="38%" /></div>
              </div>
              {/* XP */}
              <div style={{ display: "grid", gridTemplateColumns: "1.6vw 1fr", alignItems: "center", columnGap: "0.3vw", height: "1.0vw", marginBottom: "0.35vh" }}>
                <span style={{ fontSize: "0.68vw" }}>XP</span>
                <Bar color="#8e54c4" value={`${(cur.expPercent ?? 0).toFixed(4)}%`} label />
              </div>
              {/* SP / Rep */}
              <div style={{ display: "grid", gridTemplateColumns: "1.6vw 1fr auto auto", alignItems: "center", columnGap: "0.5vw", fontSize: "0.68vw" }}>
                <span>SP</span>
                <span style={{ color: "#d8cca6" }}>{fmt(cur.sp)}</span>
                <span style={{ color: "#b3ab98" }}>Rep.</span>
                <span style={{ color: "#d8cca6", minWidth: "2vw" }}>0</span>
              </div>
            </div>
          </div>
        )}

        {/* Play (bottom-centre) */}
        <div style={{ position: "absolute", left: "50%", bottom: "1.6%", transform: "translateX(-50%)" }}>
          <L2Btn primary disabled={!cur} onClick={() => cur && onStart?.(selected)} style={{ minWidth: "9vw", padding: "0.7vh 2vw", fontSize: "0.95vw" }}>Play</L2Btn>
        </div>

        {/* Credits / Exit (bottom-left) */}
        <div style={{ position: "absolute", left: "0.8%", bottom: "1.4%", display: "flex", flexDirection: "column", gap: "0.5vh" }}>
          <L2Btn onClick={() => onBack?.()}>Credits</L2Btn>
          <L2Btn onClick={() => onBack?.()}>Exit</L2Btn>
        </div>

        {/* Create / Delete (bottom-right) */}
        <div style={{ position: "absolute", right: "0.8%", bottom: "1.4%", display: "flex", gap: "0.6vw" }}>
          <L2Btn onClick={() => onCreate?.()}>Create</L2Btn>
          <L2Btn disabled={!cur} onClick={() => cur && onDelete?.(selected)}>Delete</L2Btn>
        </div>
      </section>
    </div>
  );
}
