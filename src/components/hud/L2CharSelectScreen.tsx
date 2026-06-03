/**
 * Authentic L2 character-select screen — real CharSelect art (LogBG.utx) with the
 * character slot list on the left, a stage for the 3D model in the centre, and the
 * Start / Create / Delete / Back actions along the bottom (like the live client).
 *
 *   <SpriteProvider>
 *     <L2CharSelectScreen
 *        characters={chars} selected={i} onSelect={setI}
 *        onStart={...} onCreate={...} onDelete={...} onBack={...}
 *        renderModel={(c)=> <CharacterModel char={c}/> } />
 *   </SpriteProvider>
 *
 * `characters` come straight from CharSelectionInfo (name, level, className, …).
 */
import { L2Frame, L2Button } from "@/components/hud/L2Sprite";
import type { ReactNode } from "react";

const BG = "/hud/screens/CharSelect.png";

export interface CharSlot {
  name: string;
  level: number;
  className?: string;
  className2?: string; // sub/awakened name
}

export function L2CharSelectScreen({
  characters = [], selected = 0, maxSlots = 7,
  onSelect, onStart, onCreate, onDelete, onBack, renderModel,
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
  const slots = Array.from({ length: maxSlots }, (_, i) => characters[i] ?? null);
  const cur = characters[selected] ?? null;

  return (
    <div style={{ position: "fixed", inset: 0, background: `#000 url(${BG}) center/cover no-repeat`, fontFamily: "Tahoma, Geneva, sans-serif", color: "#e6dcc0", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(0,0,0,0.55) 0%, transparent 40%)" }} />

      {/* character slot list (left) */}
      <div style={{ position: "absolute", left: 22, top: 64, width: 224, display: "flex", flexDirection: "column", gap: 6 }}>
        {slots.map((c, i) => {
          const sel = i === selected && c;
          return (
            <L2Frame
              key={i}
              style={{ height: 44, padding: "5px 10px", cursor: c ? "pointer" : "default", background: sel ? "rgba(70,56,28,0.55)" : "rgba(6,7,9,0.5)" }}
            >
              <div onClick={() => c && onSelect?.(i)} onDoubleClick={() => c && onStart?.(i)} style={{ height: "100%" }}>
                {c ? (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 700, color: sel ? "#f4e6b8" : "#dcd0aa", textShadow: "0 1px 1px #000" }}>{c.name}</div>
                    <div style={{ fontSize: 10, color: "#b0a482" }}>Lv {c.level} {c.className2 ?? c.className ?? ""}</div>
                  </>
                ) : (
                  <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#7a7058" }}>Empty Slot</div>
                )}
              </div>
            </L2Frame>
          );
        })}
      </div>

      {/* 3D model stage (centre-right) */}
      <div style={{ position: "absolute", left: "46%", top: 90, bottom: 64, right: 40, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
        {renderModel ? renderModel(cur) : (
          <div style={{ width: 200, height: 300, border: "1px dashed rgba(150,135,95,0.4)", borderRadius: "50% 50% 8px 8px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "rgba(200,185,150,0.6)" }}>
            {cur ? cur.name : "—"}
          </div>
        )}
      </div>

      {/* selected char name banner */}
      {cur && (
        <div style={{ position: "absolute", left: "46%", right: 40, top: 56, textAlign: "center", fontSize: 18, fontWeight: 700, letterSpacing: 1, color: "#f0e2b8", textShadow: "0 2px 3px #000" }}>
          {cur.name} <span style={{ fontSize: 12, color: "#c9a04a" }}>Lv {cur.level}</span>
        </div>
      )}

      {/* action bar (bottom) */}
      <div style={{ position: "absolute", right: 28, bottom: 22, display: "flex", gap: 8 }}>
        <L2Button onClick={() => onCreate?.()} width={120}>Create Character</L2Button>
        <L2Button onClick={() => cur && onDelete?.(selected)} disabled={!cur} width={120}>Delete Character</L2Button>
        <L2Button onClick={() => onBack?.()} width={70}>Back</L2Button>
        <L2Button onClick={() => cur && onStart?.(selected)} disabled={!cur} variant="large" width={120}>Start</L2Button>
      </div>
    </div>
  );
}
