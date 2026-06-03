import type { ReactNode } from "react";
const charSelect = { url: "/hud/screens/CharSelect.png" };

export interface CharSlot {
  name: string;
  level: number;
  className?: string;
  className2?: string;
  hp?: number;
  mp?: number;
  sp?: number;
  expPercent?: number;
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
          width: "min(100vw, 177.823vh)",
          height: "min(100vh, 56.236vw)",
          background: `url(${charSelect.url}) center/contain no-repeat`,
        }}
      >
        {Array.from({ length: maxSlots }, (_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Character slot ${i + 1}`}
            onClick={() => characters[i] && onSelect?.(i)}
            onDoubleClick={() => characters[i] && onStart?.(i)}
            style={{
              position: "absolute",
              right: "0.3%",
              top: `${18.1 + i * 10.6}%`,
              width: "17.3%",
              height: "8.3%",
              opacity: 0,
              border: 0,
              cursor: characters[i] ? "pointer" : "default",
            }}
          />
        ))}
        <button
          type="button"
          aria-label="Credits"
          onClick={() => onBack?.()}
          style={{
            position: "absolute",
            left: "0.3%",
            bottom: "4.1%",
            width: "5.4%",
            height: "2.4%",
            opacity: 0,
            border: 0,
            cursor: "pointer",
          }}
        />
        <button
          type="button"
          aria-label="Exit"
          onClick={() => onBack?.()}
          style={{
            position: "absolute",
            left: "0.3%",
            bottom: "0.8%",
            width: "5.4%",
            height: "2.4%",
            opacity: 0,
            border: 0,
            cursor: "pointer",
          }}
        />
        <button
          type="button"
          aria-label="Play"
          disabled={!cur}
          onClick={() => cur && onStart?.(selected)}
          style={{
            position: "absolute",
            left: "47.2%",
            bottom: "0.8%",
            width: "5.8%",
            height: "2.6%",
            opacity: 0,
            border: 0,
            cursor: cur ? "pointer" : "default",
          }}
        />
        <button
          type="button"
          aria-label="Create"
          onClick={() => onCreate?.()}
          style={{
            position: "absolute",
            right: "7.3%",
            bottom: "1%",
            width: "5.4%",
            height: "2.4%",
            opacity: 0,
            border: 0,
            cursor: "pointer",
          }}
        />
        <button
          type="button"
          aria-label="Delete"
          disabled={!cur}
          onClick={() => cur && onDelete?.(selected)}
          style={{
            position: "absolute",
            right: "1.8%",
            bottom: "1%",
            width: "5.2%",
            height: "2.4%",
            opacity: 0,
            border: 0,
            cursor: cur ? "pointer" : "default",
          }}
        />
      </div>
    </div>
  );
}
