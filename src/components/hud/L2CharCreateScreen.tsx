/**
 * Authentic L2 character-creation screen — real CharCreate art (LogBG.utx) with a
 * 3D model stage on the left and the race / class / appearance / name panel on the
 * right, ending in Create / Cancel (like the live client's "Make Your Character").
 *
 *   <SpriteProvider>
 *     <L2CharCreateScreen onCreate={(opts)=>sendCharacterCreate(opts)} onCancel={...}
 *                         renderModel={(o)=> <CharacterModel opts={o}/> } />
 *   </SpriteProvider>
 */
import { useState, type ReactNode } from "react";
import { L2Frame, L2Button } from "@/components/hud/L2Sprite";

const BG = "/hud/screens/CharCreate.png";

// Classic/Mobius starting races & their base fighter/mystic choices.
const RACES = ["Human", "Elf", "Dark Elf", "Orc", "Dwarf", "Kamael", "Ertheia"];
const CLASSES: Record<string, string[]> = {
  Human: ["Fighter", "Mystic"], Elf: ["Fighter", "Mystic"], "Dark Elf": ["Fighter", "Mystic"],
  Orc: ["Fighter", "Mystic"], Dwarf: ["Fighter"], Kamael: ["Soldier"], Ertheia: ["Mystic"],
};

export interface CharCreateOpts { race: string; cls: string; sex: 0 | 1; face: number; hair: number; hairColor: number; name: string }

function Picker({ label, value, onPrev, onNext }: { label: string; value: string; onPrev?: () => void; onNext?: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", height: 28, gap: 8 }}>
      <span style={{ width: 78, fontSize: 11, fontWeight: 700, color: "#d6c79a" }}>{label}</span>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", height: 22, background: "#0a0a08", border: "1px solid #5a4e32", padding: "0 8px" }}>
        <span onClick={onPrev} style={{ cursor: "pointer", color: "#c9a04a", userSelect: "none" }}>‹</span>
        <span style={{ fontSize: 11, color: "#e6dcc0" }}>{value}</span>
        <span onClick={onNext} style={{ cursor: "pointer", color: "#c9a04a", userSelect: "none" }}>›</span>
      </div>
    </div>
  );
}

export function L2CharCreateScreen({
  onCreate, onCancel, renderModel,
}: { onCreate?: (o: CharCreateOpts) => void; onCancel?: () => void; renderModel?: (o: CharCreateOpts) => ReactNode }) {
  const [raceI, setRaceI] = useState(0);
  const [clsI, setClsI] = useState(0);
  const [sex, setSex] = useState<0 | 1>(0);
  const [face, setFace] = useState(0);
  const [hair, setHair] = useState(0);
  const [hairColor, setHairColor] = useState(0);
  const [name, setName] = useState("");

  const race = RACES[raceI];
  const classList = CLASSES[race] ?? ["Fighter"];
  const cls = classList[clsI % classList.length];
  const cyc = (n: number, d: number, m: number) => ((n + d) % m + m) % m;
  const opts: CharCreateOpts = { race, cls, sex, face, hair, hairColor, name };

  return (
    <div style={{ position: "fixed", inset: 0, background: `#000 url(${BG}) center/cover no-repeat`, fontFamily: "Tahoma, Geneva, sans-serif", color: "#e6dcc0", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(270deg, rgba(0,0,0,0.5) 0%, transparent 45%)" }} />

      {/* 3D model stage (left) */}
      <div style={{ position: "absolute", left: 60, top: 90, bottom: 50, width: 320, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
        {renderModel ? renderModel(opts) : (
          <div style={{ width: 200, height: 300, border: "1px dashed rgba(150,135,95,0.4)", borderRadius: "50% 50% 8px 8px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "rgba(200,185,150,0.6)" }}>
            {race} {cls} · {sex ? "♀" : "♂"}
          </div>
        )}
      </div>

      {/* options panel (right) */}
      <L2Frame style={{ position: "absolute", right: 28, top: 60, width: 286, padding: 16, background: "rgba(6,7,9,0.6)" }}>
        <div style={{ textAlign: "center", fontSize: 14, fontWeight: 700, letterSpacing: 1, color: "#e6c87a", textShadow: "0 1px 2px #000", marginBottom: 12 }}>Character Creation</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <Picker label="Race" value={race} onPrev={() => { setRaceI((i) => cyc(i, -1, RACES.length)); setClsI(0); }} onNext={() => { setRaceI((i) => cyc(i, 1, RACES.length)); setClsI(0); }} />
          <Picker label="Class" value={cls} onPrev={() => setClsI((i) => cyc(i, -1, classList.length))} onNext={() => setClsI((i) => cyc(i, 1, classList.length))} />
          <Picker label="Sex" value={sex ? "Female" : "Male"} onPrev={() => setSex((s) => (s ? 0 : 1))} onNext={() => setSex((s) => (s ? 0 : 1))} />
          <Picker label="Face" value={`${face + 1}`} onPrev={() => setFace((n) => cyc(n, -1, 3))} onNext={() => setFace((n) => cyc(n, 1, 3))} />
          <Picker label="Hair Style" value={`${hair + 1}`} onPrev={() => setHair((n) => cyc(n, -1, 6))} onNext={() => setHair((n) => cyc(n, 1, 6))} />
          <Picker label="Hair Color" value={`${hairColor + 1}`} onPrev={() => setHairColor((n) => cyc(n, -1, 4))} onNext={() => setHairColor((n) => cyc(n, 1, 4))} />
          <div style={{ display: "flex", alignItems: "center", height: 28, gap: 8, marginTop: 4 }}>
            <span style={{ width: 78, fontSize: 11, fontWeight: 700, color: "#d6c79a" }}>Name</span>
            <input value={name} maxLength={16} onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9]/g, ""))}
              style={{ flex: 1, height: 22, background: "#0a0a08", border: "1px solid #5a4e32", color: "#e6dcc0", fontFamily: "Tahoma, sans-serif", fontSize: 12, padding: "0 6px", outline: "none" }} />
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 16 }}>
          <L2Button onClick={() => name.length >= 1 && onCreate?.(opts)} disabled={name.length < 1} variant="large" width={110}>Create</L2Button>
          <L2Button onClick={() => onCancel?.()} width={90}>Cancel</L2Button>
        </div>
      </L2Frame>
    </div>
  );
}
