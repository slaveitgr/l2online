import { useMemo, useState, type ReactNode } from "react";
import { L2Button } from "@/components/hud/L2Sprite";

const BG = "/hud/screens/CharCreate.png";

const RACES = ["Human", "Elf", "Dark Elf", "Orc", "Dwarf", "Kamael", "Ertheia"];
const CLASSES: Record<string, string[]> = {
  Human: ["Fighter", "Mystic"],
  Elf: ["Fighter", "Mystic"],
  "Dark Elf": ["Fighter", "Mystic"],
  Orc: ["Fighter", "Mystic"],
  Dwarf: ["Fighter"],
  Kamael: ["Soldier"],
  Ertheia: ["Mystic"],
};

const RACE_DESCRIPTIONS: Record<string, string> = {
  Human: "Versatile warriors with balanced physical and magical growth.",
  Elf: "Graceful children of water with speed, precision, and refined magic.",
  "Dark Elf": "Aggressive spellblades with powerful offense and dark magic.",
  Orc: "Fierce frontline fighters and shamans with brutal resilience.",
  Dwarf: "Master craftsmen of the earth with high durability and utility.",
  Kamael: "Engineered warriors built for swift, disciplined combat.",
  Ertheia: "Mystic wanderers with elegant movement and support magic.",
};

export interface CharCreateOpts {
  race: string;
  cls: string;
  sex: 0 | 1;
  face: number;
  hair: number;
  hairColor: number;
  name: string;
}

function OptionBox({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ marginBottom: 8, color: "#f3e1a1", fontSize: 18, textAlign: "right" }}>{label}</div>
      {children}
    </div>
  );
}

function ChoiceRow({
  values,
  selected,
  onSelect,
}: {
  values: string[];
  selected: number;
  onSelect: (i: number) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
      {values.map((value, i) => {
        const active = i === selected;
        return (
          <button
            key={value}
            type="button"
            onClick={() => onSelect(i)}
            style={{
              minWidth: 74,
              height: 74,
              border: active ? "2px solid rgba(255,219,102,0.95)" : "1px solid rgba(255,255,255,0.18)",
              background: active
                ? "linear-gradient(180deg, rgba(255,232,133,0.35), rgba(69,43,26,0.58))"
                : "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(0,0,0,0.35))",
              color: active ? "#fff4c6" : "#ead8be",
              fontSize: 12,
              boxShadow: active ? "0 0 18px rgba(255,214,90,0.28)" : "none",
              padding: "8px 10px",
            }}
          >
            {value}
          </button>
        );
      })}
    </div>
  );
}

export function L2CharCreateScreen({
  onCreate,
  onCancel,
  renderModel,
}: {
  onCreate?: (o: CharCreateOpts) => void;
  onCancel?: () => void;
  renderModel?: (o: CharCreateOpts) => ReactNode;
}) {
  const [raceI, setRaceI] = useState(4);
  const [clsI, setClsI] = useState(0);
  const [sex, setSex] = useState<0 | 1>(1);
  const [face, setFace] = useState(0);
  const [hair, setHair] = useState(0);
  const [hairColor, setHairColor] = useState(0);
  const [name, setName] = useState("");

  const race = RACES[raceI];
  const classList = CLASSES[race] ?? ["Fighter"];

  const opts = useMemo<CharCreateOpts>(() => ({
    race,
    cls: classList[Math.min(clsI, classList.length - 1)] ?? classList[0],
    sex,
    face,
    hair,
    hairColor,
    name,
  }), [race, classList, clsI, sex, face, hair, hairColor, name]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: `#000 url(${BG}) center/cover no-repeat`,
        fontFamily: "Tahoma, Geneva, sans-serif",
        color: "#f4ecdc",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.1), rgba(0,0,0,0.35))" }} />

      <div
        style={{
          position: "absolute",
          left: 16,
          top: 6,
          fontFamily: "'Times New Roman', Georgia, serif",
          fontSize: 40,
          fontWeight: 700,
          letterSpacing: 3,
          color: "#ffffff",
          textShadow: "0 2px 6px rgba(0,0,0,0.85), 0 0 18px rgba(0,0,0,0.5)",
          textTransform: "uppercase",
        }}
      >
        Make Your Character
      </div>


      <div style={{ position: "absolute", left: 42, top: 58, width: 265, color: "#e8d7b0", textShadow: "0 2px 6px rgba(0,0,0,0.65)" }}>
        <div style={{ fontSize: 30, fontStyle: "italic", color: "#d8b464", marginBottom: 14 }}>{race}</div>
        <div style={{ fontSize: 16, lineHeight: 1.55, color: "rgba(255,255,255,0.82)" }}>{RACE_DESCRIPTIONS[race]}</div>
        <div style={{ marginTop: 24, fontSize: 16, color: "#f0d27f" }}>Race Characteristics</div>
        <div style={{ marginTop: 10, display: "grid", gap: 8, fontSize: 14, color: "rgba(255,255,255,0.86)" }}>
          <div>• Dexterity</div>
          <div>• Balance of Earth</div>
        </div>
        <div style={{ marginTop: 28, fontSize: 16, color: "#f0d27f" }}>Basic Stats</div>
        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", rowGap: 8, columnGap: 14, fontSize: 14 }}>
          <div>STR 39</div>
          <div>DEX 25</div>
          <div>INT 77</div>
          <div>CON 42</div>
          <div>MEN 81</div>
          <div>LUC 35</div>
          <div>WIT 77</div>
          <div>CHA 40</div>
        </div>
      </div>

      <div style={{ position: "absolute", left: "34%", right: "25%", top: 34, display: "flex", justifyContent: "center", gap: 22 }}>
        {RACES.map((entry, i) => {
          const active = i === raceI;
          return (
            <button
              key={entry}
              type="button"
              onClick={() => {
                setRaceI(i);
                setClsI(0);
              }}
              style={{
                background: "transparent",
                border: "none",
                color: active ? "#fff1bc" : "rgba(255,255,255,0.88)",
                fontSize: 18,
                padding: 0,
                textShadow: active ? "0 0 18px rgba(255,219,102,0.8)" : "0 1px 3px rgba(0,0,0,0.6)",
                boxShadow: active ? "0 10px 24px -18px rgba(255,219,102,0.9)" : "none",
              }}
            >
              {entry}
            </button>
          );
        })}
      </div>

      <div
        style={{
          position: "absolute",
          left: "20%",
          right: "22%",
          top: 100,
          bottom: 120,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        {renderModel ? (
          renderModel(opts)
        ) : (
          <div style={{ fontSize: 22, color: "rgba(255,255,255,0.84)", textShadow: "0 2px 4px rgba(0,0,0,0.7)" }}>
            {opts.race} {opts.cls} {opts.sex ? "♀" : "♂"}
          </div>
        )}
      </div>

      <div style={{ position: "absolute", right: 28, top: 150, width: 360 }}>
        <OptionBox label="Gender">
          <ChoiceRow values={["Male", "Female"]} selected={sex} onSelect={(i) => setSex(i as 0 | 1)} />
        </OptionBox>

        <OptionBox label="Class">
          <ChoiceRow values={classList} selected={Math.min(clsI, classList.length - 1)} onSelect={setClsI} />
        </OptionBox>

        <OptionBox label="Face">
          <ChoiceRow values={["Face 1", "Face 2", "Face 3"]} selected={face} onSelect={setFace} />
        </OptionBox>

        <OptionBox label="Hairstyle">
          <ChoiceRow values={["Style 1", "Style 2", "Style 3"]} selected={hair % 3} onSelect={setHair} />
        </OptionBox>

        <OptionBox label="Hair Color">
          <ChoiceRow values={["Gold", "Brown", "Wine"]} selected={hairColor % 3} onSelect={setHairColor} />
        </OptionBox>
      </div>

      <div style={{ position: "absolute", left: "50%", bottom: 46, transform: "translateX(-50%)", width: 360, textAlign: "center" }}>
        <div style={{ fontSize: 16, color: "#f1d58b", marginBottom: 8 }}>Character Name</div>
        <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
          <input
            value={name}
            maxLength={16}
            onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9]/g, ""))}
            style={{
              width: 220,
              height: 28,
              border: "1px solid rgba(255,220,122,0.72)",
              background: "linear-gradient(180deg, rgba(17,14,12,0.95), rgba(8,8,8,0.95))",
              color: "#fff0c7",
              textAlign: "center",
              fontSize: 14,
              outline: "none",
            }}
          />
          <L2Button width={100} height={28}>Check</L2Button>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 16 }}>
          <L2Button onClick={() => name.length >= 1 && onCreate?.(opts)} disabled={name.length < 1} width={106} height={28}>Create</L2Button>
        </div>
      </div>

      <div style={{ position: "absolute", left: 6, bottom: 8 }}>
        <L2Button onClick={() => onCancel?.()} width={96} height={28}>Exit</L2Button>
      </div>
    </div>
  );
}
