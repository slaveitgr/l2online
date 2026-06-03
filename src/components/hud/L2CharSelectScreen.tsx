import type { ReactNode } from "react";

const BG = "/hud/mock/select/background-clean.png";
const OVERLAY = "/hud/mock/select/ui-overlay.png";

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

// Hotspots in the 1920x1080 reference frame
const HS = {
  credits: { x: 7, y: 1000, w: 97, h: 24 },
  exit: { x: 7, y: 1036, w: 97, h: 24 },
  play: { x: 900, y: 1000, w: 106, h: 31 },
  create: { x: 1665, y: 1022, w: 100, h: 24 },
  delete: { x: 1770, y: 1022, w: 99, h: 24 },
  slotMain: { x: 1572, y: 194, w: 324, h: 78 },
  slotRow: { x: 1572, w: 324, h: 77, top: 293, step: 99 },
};

const BASE_W = 1920;
const BASE_H = 1080;

function pct(v: number, base: number) {
  return `${(v / base) * 100}%`;
}

function Hotspot({
  rect,
  onClick,
  onDoubleClick,
  disabled,
  label,
}: {
  rect: { x: number; y: number; w: number; h: number };
  onClick?: () => void;
  onDoubleClick?: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      disabled={disabled}
      style={{
        position: "absolute",
        left: pct(rect.x, BASE_W),
        top: pct(rect.y, BASE_H),
        width: pct(rect.w, BASE_W),
        height: pct(rect.h, BASE_H),
        border: 0,
        background: "transparent",
        padding: 0,
        cursor: disabled ? "default" : "pointer",
      }}
    />
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
        display: "grid",
        placeItems: "center",
        background: "#05090b",
        overflow: "hidden",
        userSelect: "none",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <section
        style={{
          position: "relative",
          width: "min(100vw, calc(100vh * 16 / 9))",
          height: "min(100vh, calc(100vw * 9 / 16))",
          overflow: "hidden",
          background: "#111",
          boxShadow: "0 0 40px rgba(0,0,0,0.75)",
        }}
      >
        <img
          src={BG}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "fill",
            pointerEvents: "none",
          }}
        />
        <img
          src={OVERLAY}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "fill",
            pointerEvents: "none",
          }}
        />

        <Hotspot rect={HS.credits} label="Credits" onClick={() => onBack?.()} />
        <Hotspot rect={HS.exit} label="Exit" onClick={() => onBack?.()} />
        <Hotspot
          rect={HS.play}
          label="Play"
          disabled={!cur}
          onClick={() => cur && onStart?.(selected)}
        />
        <Hotspot rect={HS.create} label="Create" onClick={() => onCreate?.()} />
        <Hotspot
          rect={HS.delete}
          label="Delete"
          disabled={!cur}
          onClick={() => cur && onDelete?.(selected)}
        />

        <Hotspot
          rect={HS.slotMain}
          label="Character slot 1"
          disabled={!characters[0]}
          onClick={() => onSelect?.(0)}
          onDoubleClick={() => characters[0] && onStart?.(0)}
        />
        {Array.from({ length: maxSlots - 1 }, (_, k) => {
          const i = k + 1;
          const rect = {
            x: HS.slotRow.x,
            y: HS.slotRow.top + k * HS.slotRow.step,
            w: HS.slotRow.w,
            h: HS.slotRow.h,
          };
          return (
            <Hotspot
              key={i}
              rect={rect}
              label={`Character slot ${i + 1}`}
              disabled={!characters[i]}
              onClick={() => characters[i] && onSelect?.(i)}
              onDoubleClick={() => characters[i] && onStart?.(i)}
            />
          );
        })}

        {/* Always-on visible action bar — guarantees Play/Create/Delete/Exit are clickable */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: "1.5%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: 8,
            zIndex: 20,
            fontFamily: "Tahoma, Geneva, sans-serif",
          }}
        >
          <ActionBtn label="Play" disabled={!cur} onClick={() => cur && onStart?.(selected)} primary />
          <ActionBtn label="Create" onClick={() => onCreate?.()} />
          <ActionBtn label="Delete" disabled={!cur} onClick={() => cur && onDelete?.(selected)} />
          <ActionBtn label="Exit" onClick={() => onBack?.()} />
        </div>

        {/* Character roster fallback — clickable list of real characters */}
        {characters.length > 0 && (
          <div
            style={{
              position: "absolute",
              right: "1%",
              top: "16%",
              width: "18%",
              maxHeight: "70%",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 4,
              zIndex: 20,
              fontFamily: "Tahoma, Geneva, sans-serif",
            }}
          >
            {characters.map((c, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onSelect?.(i)}
                onDoubleClick={() => onStart?.(i)}
                style={{
                  textAlign: "left",
                  padding: "6px 8px",
                  background: i === selected ? "rgba(120,90,40,0.8)" : "rgba(0,0,0,0.55)",
                  border: `1px solid ${i === selected ? "#c9a04a" : "#3a3220"}`,
                  color: "#e6dcc0",
                  fontSize: 12,
                  cursor: "pointer",
                  textShadow: "0 1px 1px #000",
                }}
              >
                <div style={{ fontWeight: 700 }}>
                  Lv {c.level} {c.name}
                </div>
                {c.className && (
                  <div style={{ fontSize: 10, color: "#9c906f" }}>{c.className}</div>
                )}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ActionBtn({
  label,
  onClick,
  disabled,
  primary,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        minWidth: 88,
        padding: "8px 14px",
        background: disabled
          ? "linear-gradient(180deg,#2a2620,#1a1612)"
          : primary
            ? "linear-gradient(180deg,#d8b25a,#8a6a20)"
            : "linear-gradient(180deg,#3a3424,#1f1a10)",
        color: disabled ? "#6a6258" : "#f6ecc8",
        border: `1px solid ${primary ? "#e6c87a" : "#5a4a28"}`,
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: 1,
        textTransform: "uppercase",
        cursor: disabled ? "default" : "pointer",
        textShadow: "0 1px 1px #000",
        boxShadow: "0 2px 6px rgba(0,0,0,0.55)",
      }}
    >
      {label}
    </button>
  );
}
