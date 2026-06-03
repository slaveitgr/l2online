import { useMemo, useState, type CSSProperties, type ReactNode } from "react";

const A = "/hud/mock/character";

const RACES = [
  { key: "Human", img: `${A}/race_human.png`, x: 690 },
  { key: "Elf", img: `${A}/race_elf.png`, x: 780 },
  { key: "Dark Elf", img: `${A}/race_darkelf.png`, x: 870 },
  { key: "Orc", img: `${A}/race_orc.png`, x: 960 },
  { key: "Dwarf", img: `${A}/race_dwarf.png`, x: 1051 },
  { key: "Kamael", img: `${A}/race_kamael.png`, x: 1141 },
  { key: "Ertheia", img: `${A}/race_ertheia.png`, x: 1231 },
];

const RACE_INFO: Record<
  string,
  { blurb: string; traits: [string, string]; stats: Record<string, number> }
> = {
  Human: {
    blurb:
      "Humans are the most adaptable race, balanced in all attributes and able to walk any class path.",
    traits: ["Versatility", "Blessing of Light"],
    stats: { STR: 40, INT: 36, WIT: 30, MEN: 36, CHA: 40, DEX: 30, CON: 43, LUC: 35 },
  },
  Elf: {
    blurb:
      "Elves are graceful descendants of the Water Spirit. They excel at archery and elemental magic.",
    traits: ["Agility", "Blessing of Water"],
    stats: { STR: 36, INT: 38, WIT: 36, MEN: 38, CHA: 42, DEX: 34, CON: 32, LUC: 36 },
  },
  "Dark Elf": {
    blurb:
      "Once exiled, the Dark Elves rule with deadly precision in both blade and curse.",
    traits: ["Lethality", "Shadow Pact"],
    stats: { STR: 41, INT: 44, WIT: 36, MEN: 38, CHA: 36, DEX: 34, CON: 32, LUC: 34 },
  },
  Orc: {
    blurb:
      "Born of fire, the Orcs are fearsome warriors and shamans, devoted to the Spirit of Flame.",
    traits: ["Endurance", "Blessing of Fire"],
    stats: { STR: 46, INT: 33, WIT: 27, MEN: 30, CHA: 36, DEX: 25, CON: 47, LUC: 32 },
  },
  Dwarf: {
    blurb:
      "Dwarves were created by Einhasad with the help of the Earth Spirit. They worship Maphr, the Goddess of Earth. Dwarves excel at crafting, but their fighting capabilities are not to be underestimated.",
    traits: ["Dexterity", "Blessing of Earth"],
    stats: { STR: 39, INT: 77, WIT: 77, MEN: 81, CHA: 40, DEX: 25, CON: 42, LUC: 35 },
  },
  Kamael: {
    blurb:
      "A winged race of soldiers forged for war, the Kamael draw power from their fallen foes.",
    traits: ["Soul Harvest", "Wings of Steel"],
    stats: { STR: 44, INT: 32, WIT: 34, MEN: 32, CHA: 36, DEX: 36, CON: 38, LUC: 32 },
  },
  Ertheia: {
    blurb:
      "Cheerful wanderers of the wind, Ertheia channel pure mystic energy with little effort.",
    traits: ["Affinity", "Blessing of Wind"],
    stats: { STR: 30, INT: 48, WIT: 44, MEN: 40, CHA: 44, DEX: 36, CON: 30, LUC: 38 },
  },
};

const CLASSES: Record<string, string[]> = {
  Human: ["Fighter", "Mystic"],
  Elf: ["Fighter", "Mystic"],
  "Dark Elf": ["Fighter", "Mystic"],
  Orc: ["Fighter", "Mystic"],
  Dwarf: ["Fighter"],
  Kamael: ["Soldier"],
  Ertheia: ["Mystic"],
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

// All positions in the 1920x1080 reference frame, scaled to viewport
const BASE_W = 1920;
const BASE_H = 1080;
const stageStyle: CSSProperties = {
  position: "relative",
  width: BASE_W,
  height: BASE_H,
  transformOrigin: "center center",
};

function StatLabel({
  label,
  value,
  style,
}: {
  label: string;
  value: number;
  style: CSSProperties;
}) {
  return (
    <span
      style={{
        position: "absolute",
        fontSize: 14,
        color: "#d9d8d4",
        ...style,
      }}
    >
      {label} <b style={{ fontWeight: 400, marginLeft: 22, color: "#c8b984" }}>{value}</b>
    </span>
  );
}

export function L2CharCreateScreen({
  onCreate,
  onCancel,
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
  const race = RACES[raceI].key;
  const info = RACE_INFO[race];
  const classList = useMemo(() => CLASSES[race] ?? ["Fighter"], [race]);
  const cls = classList[Math.min(clsI, classList.length - 1)] ?? classList[0];
  const opts: CharCreateOpts = { race, cls, sex, face, hair, hairColor, name };

  const STAT_POS: Record<string, CSSProperties> = {
    STR: { left: 103, top: 25 },
    INT: { left: 0, top: 63 },
    WIT: { left: 12, top: 134 },
    MEN: { left: 2, top: 208 },
    CHA: { left: 104, top: 240 },
    DEX: { left: 246, top: 63 },
    CON: { left: 275, top: 134 },
    LUC: { left: 205, top: 208 },
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        placeItems: "center",
        background: "#000",
        overflow: "hidden",
        color: "#e8dfb8",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <div
        style={{
          ...stageStyle,
          scale: "min(calc(100vw / 1920), calc(100vh / 1080))" as unknown as string,
        }}
      >
        <img
          src={`${A}/character-bg-clean.jpg`}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            userSelect: "none",
            pointerEvents: "none",
          }}
        />

        {/* Race tabs */}
        <nav style={{ position: "absolute", left: 0, top: 0, right: 0, height: 88 }}>
          {RACES.map((r, i) => {
            const active = i === raceI;
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => {
                  setRaceI(i);
                  setClsI(0);
                }}
                style={{
                  position: "absolute",
                  left: r.x,
                  top: 10,
                  transform: "translateX(-50%)",
                  width: 82,
                  height: 68,
                  border: 0,
                  background: "transparent",
                  color: "#e6e1db",
                  textShadow: "0 1px 3px #000",
                  fontSize: 14,
                  lineHeight: "16px",
                  padding: 0,
                  cursor: "pointer",
                }}
              >
                <span style={{ display: "block", height: 21 }}>{r.key}</span>
                <img
                  src={r.img}
                  alt={r.key}
                  style={{
                    maxWidth: 62,
                    maxHeight: 50,
                    filter: active
                      ? "drop-shadow(0 0 10px #e8c942) drop-shadow(0 0 18px #c69218)"
                      : "drop-shadow(0 1px 1px #000)",
                  }}
                />
              </button>
            );
          })}
        </nav>
        <div
          style={{
            position: "absolute",
            left: 565,
            top: 80,
            width: 690,
            height: 1,
            background:
              "linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.35), rgba(255,255,255,0))",
          }}
        />

        {/* Left panel */}
        <aside
          style={{
            position: "absolute",
            left: 38,
            top: 222,
            width: 325,
            color: "#d9d7d2",
            textShadow: "0 2px 2px #000",
            fontSize: 16,
            lineHeight: "19px",
          }}
        >
          <h1
            style={{
              margin: "0 0 12px 0",
              fontFamily: "Georgia, serif",
              color: "#d6c65c",
              fontSize: 29,
              fontWeight: 400,
            }}
          >
            {race}
          </h1>
          <p style={{ margin: "0 0 13px 0", color: "#e1e0dd" }}>{info.blurb}</p>
          <h2
            style={{
              position: "relative",
              margin: "8px 0 10px 0",
              paddingLeft: 22,
              color: "#f0e6b9",
              fontSize: 17,
              fontWeight: 400,
            }}
          >
            <span
              style={{
                position: "absolute",
                left: 0,
                top: -2,
                color: "#d8c459",
                textShadow: "0 0 5px #d9b945",
              }}
            >
              ✥
            </span>
            Race Characteristics
          </h2>
          <div
            style={{
              display: "flex",
              gap: 70,
              paddingLeft: 16,
              marginBottom: 45,
              fontSize: 14,
              color: "#dcdad5",
            }}
          >
            <span>
              <img
                src={`${A}/trait_dex.png`}
                alt=""
                style={{ width: 18, height: 18, marginRight: 8, verticalAlign: "middle" }}
              />
              {info.traits[0]}
            </span>
            <span>
              <img
                src={`${A}/trait_bless.png`}
                alt=""
                style={{ width: 18, height: 18, marginRight: 8, verticalAlign: "middle" }}
              />
              {info.traits[1]}
            </span>
          </div>
          <h2
            style={{
              position: "relative",
              margin: "0 0 10px 0",
              paddingLeft: 22,
              color: "#f0e6b9",
              fontSize: 17,
              fontWeight: 400,
            }}
          >
            <span
              style={{
                position: "absolute",
                left: 0,
                top: -2,
                color: "#d8c459",
                textShadow: "0 0 5px #d9b945",
              }}
            >
              ✥
            </span>
            Basic Stats
          </h2>
          <div style={{ position: "relative", height: 260 }}>
            <div
              style={{
                position: "absolute",
                left: 52,
                top: 55,
                width: 170,
                height: 170,
                background:
                  "repeating-radial-gradient(circle at center, transparent 0 12px, rgba(85,105,160,0.35) 13px 14px), conic-gradient(from 250deg, rgba(54,96,214,0.45), rgba(11,25,67,0.65), rgba(64,80,132,0.35), rgba(54,96,214,0.45))",
                clipPath:
                  "polygon(50% 0, 76% 17%, 100% 50%, 76% 83%, 50% 100%, 24% 83%, 0 50%, 24% 17%)",
                opacity: 0.72,
              }}
            />
            {Object.entries(info.stats).map(([k, v]) => (
              <StatLabel key={k} label={k} value={v} style={STAT_POS[k]} />
            ))}
          </div>
        </aside>

        {/* Right panel */}
        <aside
          style={{
            position: "absolute",
            right: 16,
            top: 225,
            width: 245,
            color: "#f0e7ad",
            textShadow: "0 2px 2px #000",
          }}
        >
          <Group title="Gender" top={0}>
            <Tile selected={sex === 0} onClick={() => setSex(0)} src={`${A}/gender_male.png`} />
            <Tile selected={sex === 1} onClick={() => setSex(1)} src={`${A}/gender_female.png`} />
          </Group>
          <Group title="Class" top={126}>
            {classList.map((c, i) => (
              <Tile
                key={c}
                selected={clsI === i}
                onClick={() => setClsI(i)}
                src={i === 0 ? `${A}/class_left.png` : `${A}/class_right.png`}
              />
            ))}
          </Group>
          <Group title="Face" top={273}>
            {[0, 1, 2].map((i) => (
              <Mini
                key={i}
                selected={face === i}
                onClick={() => setFace(i)}
                src={`${A}/face_${i + 1}.png`}
              />
            ))}
          </Group>
          <Group title="Hair style" top={382}>
            {[0, 1, 2].map((i) => (
              <Mini
                key={i}
                selected={hair === i}
                onClick={() => setHair(i)}
                src={`${A}/hair_${i + 1}.png`}
              />
            ))}
          </Group>
          <Group title="Hair Color" top={479}>
            {[0, 1, 2].map((i) => (
              <Mini
                key={i}
                selected={hairColor === i}
                onClick={() => setHairColor(i)}
                src={`${A}/color_${i + 1}.png`}
              />
            ))}
          </Group>
        </aside>

        {/* Name + Create */}
        <section
          style={{
            position: "absolute",
            left: 840,
            top: 978,
            width: 290,
            textAlign: "center",
            color: "#efe5a6",
            textShadow: "0 2px 3px #000",
          }}
        >
          <label style={{ display: "block", fontSize: 20, marginBottom: 8 }}>Character Name</label>
          <div style={{ display: "flex", justifyContent: "center", height: 23 }}>
            <input
              suppressHydrationWarning
              type="text"
              value={name}
              maxLength={16}
              onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9]/g, ""))}
              style={{
                width: 190,
                height: 22,
                background: "linear-gradient(#111, #060606)",
                border: "1px solid #b8b194",
                borderRadius: "9px 0 0 9px",
                boxShadow: "inset 0 1px 2px #000, 0 1px 0 rgba(255,255,255,0.15)",
                color: "#eee",
                padding: "0 7px",
                outline: "none",
              }}
            />
            <button
              type="button"
              style={{
                width: 98,
                height: 22,
                marginLeft: -1,
                border: "1px solid #a69c83",
                borderRadius: "0 9px 9px 0",
                background: "linear-gradient(#423a28, #171714 45%, #2e281e)",
                color: "#e4e0d6",
                fontSize: 12,
                textShadow: "0 1px 2px #000",
                cursor: "pointer",
              }}
            >
              Check
            </button>
          </div>
          <button
            type="button"
            disabled={!name}
            onClick={() => name && onCreate?.(opts)}
            style={{
              position: "absolute",
              left: 64,
              top: 58,
              width: 107,
              height: 30,
              borderRadius: 2,
              border: "1px solid #9b927c",
              background: "linear-gradient(#5a4f39, #211d18 50%, #3b3428)",
              boxShadow: "inset 0 1px rgba(255,255,255,0.2), 0 1px 2px #000",
              color: "#e5e0d3",
              textShadow: "0 1px 2px #000",
              fontSize: 13,
              cursor: name ? "pointer" : "default",
              opacity: name ? 1 : 0.55,
            }}
          >
            Create
          </button>
        </section>

        <button
          type="button"
          onClick={() => onCancel?.()}
          style={{
            position: "absolute",
            left: 7,
            bottom: 8,
            width: 98,
            height: 27,
            border: "1px solid #8b8169",
            background: "linear-gradient(#615840, #26221b 55%, #3f382b)",
            boxShadow: "inset 0 1px rgba(255,255,255,0.19), 0 1px 2px #000",
            color: "#e4ded0",
            textShadow: "0 1px 2px #000",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Exit
        </button>

        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 84,
            background:
              "linear-gradient(to top, rgba(0,0,0,0.88), rgba(0,0,0,0.47) 55%, rgba(0,0,0,0))",
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
}

function Group({
  title,
  top,
  children,
}: {
  title: string;
  top: number;
  children: ReactNode;
}) {
  return (
    <section style={{ position: "absolute", right: 0, top, textAlign: "right" }}>
      <h3
        style={{
          margin: "0 5px 10px 0",
          fontSize: 20,
          fontWeight: 400,
          color: "#efe4a0",
        }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

function Tile({
  selected,
  onClick,
  src,
}: {
  selected?: boolean;
  onClick?: () => void;
  src: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: "relative",
        marginLeft: 8,
        border: 0,
        background: "transparent",
        padding: 0,
        verticalAlign: "top",
        cursor: "pointer",
        filter: selected
          ? "drop-shadow(0 0 5px #ffe66b) drop-shadow(0 0 8px #b78b23)"
          : undefined,
      }}
    >
      <img src={src} alt="" style={{ display: "block" }} />
    </button>
  );
}

function Mini({
  selected,
  onClick,
  src,
}: {
  selected?: boolean;
  onClick?: () => void;
  src: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: "relative",
        marginLeft: 8,
        border: 0,
        background: "transparent",
        padding: 0,
        verticalAlign: "top",
        cursor: "pointer",
        filter: selected
          ? "drop-shadow(0 0 5px #ffe66b) drop-shadow(0 0 8px #b78b23)"
          : undefined,
      }}
    >
      <img src={src} alt="" style={{ display: "block" }} />
    </button>
  );
}
