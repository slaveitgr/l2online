import { useMemo, useState, type ReactNode } from "react";
import charCreate from "@/assets/l2-client/client_char_create.png.asset.json";

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

export interface CharCreateOpts {
  race: string;
  cls: string;
  sex: 0 | 1;
  face: number;
  hair: number;
  hairColor: number;
  name: string;
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
  const race = RACES[raceI];
  const classList = useMemo(() => CLASSES[race] ?? ["Fighter"], [race]);
  const opts = useMemo<CharCreateOpts>(
    () => ({
      race,
      cls: classList[Math.min(clsI, classList.length - 1)] ?? classList[0],
      sex,
      face,
      hair,
      hairColor,
      name,
    }),
    [race, classList, clsI, sex, face, hair, hairColor, name],
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#000",
        overflow: "hidden",
        fontFamily: "Tahoma, Geneva, sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(100vw, 177.778vh)",
          height: "min(100vh, 56.25vw)",
          background: `url(${charCreate.url}) center/contain no-repeat`,
        }}
      >
        {RACES.map((entry, i) => (
          <button
            key={entry}
            type="button"
            aria-label={entry}
            onClick={() => {
              setRaceI(i);
              setClsI(0);
            }}
            style={{
              position: "absolute",
              left: `${34.5 + i * 4.75}%`,
              top: "1%",
              width: "4.1%",
              height: "6.8%",
              opacity: 0,
              border: 0,
              cursor: "pointer",
            }}
          />
        ))}
        <button
          type="button"
          aria-label="Male"
          onClick={() => setSex(0)}
          style={{
            position: "absolute",
            right: "5.45%",
            top: "23.8%",
            width: "3.9%",
            height: "6.9%",
            opacity: 0,
            border: 0,
            cursor: "pointer",
          }}
        />
        <button
          type="button"
          aria-label="Female"
          onClick={() => setSex(1)}
          style={{
            position: "absolute",
            right: "0.8%",
            top: "23.8%",
            width: "3.9%",
            height: "6.9%",
            opacity: 0,
            border: 0,
            cursor: "pointer",
          }}
        />
        {classList.map((entry, i) => (
          <button
            key={entry}
            type="button"
            aria-label={entry}
            onClick={() => setClsI(i)}
            style={{
              position: "absolute",
              right: `${5.45 - i * 4.6}%`,
              top: "35.7%",
              width: "3.9%",
              height: "6.9%",
              opacity: 0,
              border: 0,
              cursor: "pointer",
            }}
          />
        ))}
        {[0, 1, 2].map((i) => (
          <button
            key={`face-${i}`}
            type="button"
            aria-label={`Face ${i + 1}`}
            onClick={() => setFace(i)}
            style={{
              position: "absolute",
              right: `${7.7 - i * 3.55}%`,
              top: "51.7%",
              width: "3.2%",
              height: "5.8%",
              opacity: 0,
              border: 0,
              cursor: "pointer",
            }}
          />
        ))}
        {[0, 1, 2].map((i) => (
          <button
            key={`hair-${i}`}
            type="button"
            aria-label={`Hair ${i + 1}`}
            onClick={() => setHair(i)}
            style={{
              position: "absolute",
              right: `${7.7 - i * 3.55}%`,
              top: "61.3%",
              width: "3.2%",
              height: "4.8%",
              opacity: 0,
              border: 0,
              cursor: "pointer",
            }}
          />
        ))}
        {[0, 1, 2].map((i) => (
          <button
            key={`color-${i}`}
            type="button"
            aria-label={`Hair color ${i + 1}`}
            onClick={() => setHairColor(i)}
            style={{
              position: "absolute",
              right: `${7.7 - i * 3.55}%`,
              top: "70.5%",
              width: "3.2%",
              height: "4.8%",
              opacity: 0,
              border: 0,
              cursor: "pointer",
            }}
          />
        ))}
        <input
          aria-label="Character Name"
          value={name}
          maxLength={16}
          onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9]/g, ""))}
          style={{
            position: "absolute",
            left: "43.9%",
            bottom: "4.9%",
            width: "9.5%",
            height: "1.9%",
            border: 0,
            opacity: 0.01,
          }}
        />
        <button
          type="button"
          aria-label="Check"
          style={{
            position: "absolute",
            left: "53.5%",
            bottom: "4.9%",
            width: "5.2%",
            height: "1.9%",
            opacity: 0,
            border: 0,
            cursor: "pointer",
          }}
        />
        <button
          type="button"
          aria-label="Create"
          onClick={() => name && onCreate?.(opts)}
          disabled={!name}
          style={{
            position: "absolute",
            left: "47.1%",
            bottom: "0.4%",
            width: "5.6%",
            height: "3%",
            opacity: 0,
            border: 0,
            cursor: name ? "pointer" : "default",
          }}
        />
        <button
          type="button"
          aria-label="Exit"
          onClick={() => onCancel?.()}
          style={{
            position: "absolute",
            left: "0.3%",
            bottom: "0.2%",
            width: "5.1%",
            height: "2.6%",
            opacity: 0,
            border: 0,
            cursor: "pointer",
          }}
        />
      </div>
    </div>
  );
}
