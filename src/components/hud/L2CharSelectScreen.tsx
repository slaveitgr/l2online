import { L2Button } from "@/components/hud/L2Sprite";
import type { ReactNode } from "react";

const BG = "/hud/screens/CharSelect.png";

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

function Gauge({ label, value, max = 100, color }: { label: string; value: number; max?: number; color: string }) {
  const pct = Math.max(0, Math.min(100, max <= 0 ? 0 : (value / max) * 100));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "24px 1fr 68px", gap: 8, alignItems: "center" }}>
      <span style={{ fontSize: 11, color: "#e6dcc0" }}>{label}</span>
      <div style={{ height: 10, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.45)", position: "relative" }}>
        <div
          style={{
            position: "absolute",
            inset: 1,
            right: `${100 - pct}%`,
            background: color,
            boxShadow: "0 0 10px rgba(255,255,255,0.12)",
          }}
        />
      </div>
      <span style={{ fontSize: 11, color: "#d9d1bf", textAlign: "right" }}>{Math.round(value)}/{Math.round(max)}</span>
    </div>
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
  const slots = Array.from({ length: maxSlots }, (_, i) => characters[i] ?? null);
  const cur = characters[selected] ?? null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: `#000 url(${BG}) center/cover no-repeat`,
        fontFamily: "Tahoma, Geneva, sans-serif",
        color: "#f3efe5",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(0,0,0,0.18))" }} />

      <div
        style={{
          position: "absolute",
          left: 16,
          top: 12,
          fontSize: 28,
          fontWeight: 300,
          color: "rgba(255,255,255,0.92)",
          textShadow: "0 2px 4px rgba(0,0,0,0.35)",
        }}
      >
        Select Character
      </div>

      <div
        style={{
          position: "absolute",
          left: "13%",
          top: "21%",
          width: "34%",
          height: "56%",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        {renderModel ? (
          renderModel(cur)
        ) : (
          <div
            style={{
              width: 250,
              height: 420,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(255,255,255,0.66)",
              textShadow: "0 1px 2px rgba(0,0,0,0.8)",
              fontSize: 18,
            }}
          >
            {cur?.name ?? "Empty slot"}
          </div>
        )}
      </div>

      <div
        style={{
          position: "absolute",
          right: 10,
          top: 112,
          width: 300,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {slots.map((c, i) => {
          const isSelected = !!c && i === selected;
          return (
            <button
              key={i}
              type="button"
              onClick={() => c && onSelect?.(i)}
              onDoubleClick={() => c && onStart?.(i)}
              style={{
                height: 66,
                width: "100%",
                display: "grid",
                gridTemplateColumns: "92px 1fr 58px",
                alignItems: "center",
                border: isSelected ? "2px solid rgba(255, 213, 89, 0.95)" : "1px solid rgba(255,255,255,0.16)",
                background: isSelected
                  ? "linear-gradient(180deg, rgba(45,45,45,0.88) 0%, rgba(18,18,18,0.82) 100%)"
                  : "linear-gradient(180deg, rgba(72,72,72,0.35) 0%, rgba(15,15,15,0.2) 100%)",
                boxShadow: isSelected ? "0 0 20px rgba(255, 210, 94, 0.25)" : "none",
                padding: 0,
                color: "inherit",
                cursor: c ? "pointer" : "default",
              }}
            >
              <div
                style={{
                  height: "100%",
                  background: c
                    ? "linear-gradient(135deg, rgba(255,213,127,0.18), rgba(255,255,255,0.02))"
                    : "linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01))",
                  borderRight: "1px solid rgba(255,255,255,0.08)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  color: c ? "#f4e1a7" : "rgba(255,255,255,0.3)",
                }}
              >
                {c ? "Portrait" : "+"}
              </div>
              <div style={{ padding: "0 12px", textAlign: "right" }}>
                {c ? (
                  <>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#ffffff", lineHeight: 1.1 }}>Lv.{c.level}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.72)", marginTop: 3 }}>{c.className2 ?? c.className ?? ""}</div>
                    <div style={{ fontSize: 14, color: "#f1c52f", fontWeight: 700, marginTop: 2 }}>{c.name}</div>
                  </>
                ) : null}
              </div>
              <div style={{ fontSize: 30, color: "rgba(255,229,154,0.86)", textAlign: "center" }}>{c ? "" : "+"}</div>
            </button>
          );
        })}
      </div>

      {cur ? (
        <div
          style={{
            position: "absolute",
            left: "44.5%",
            transform: "translateX(-50%)",
            bottom: 74,
            width: 360,
            textAlign: "center",
            color: "#f2d182",
            textShadow: "0 2px 4px rgba(0,0,0,0.7)",
          }}
        >
          <div style={{ fontSize: 30, fontWeight: 500 }}>{cur.name}</div>
          <div style={{ fontSize: 18, color: "#ffffff", marginTop: 4 }}>Lv.{cur.level} {cur.className2 ?? cur.className ?? ""}</div>
          <div style={{ marginTop: 10, display: "grid", gap: 5 }}>
            <Gauge label="HP" value={cur.hp ?? 100} max={cur.hp ?? 100} color="linear-gradient(90deg, #8b1818, #d44b4b)" />
            <Gauge label="MP" value={cur.mp ?? 100} max={cur.mp ?? 100} color="linear-gradient(90deg, #14398b, #2f74ff)" />
            <Gauge label="SP" value={cur.sp ?? 100000} max={cur.sp ?? 100000} color="linear-gradient(90deg, #8d6f1b, #d1ac39)" />
            <Gauge label="XP" value={cur.expPercent ?? 0} max={100} color="linear-gradient(90deg, #7f7f7f, #d8d8d8)" />
          </div>
        </div>
      ) : null}

      <div style={{ position: "absolute", left: 6, bottom: 8, display: "flex", gap: 8 }}>
        <L2Button onClick={() => onBack?.()} width={96} height={28}>Credits</L2Button>
        <L2Button onClick={() => onBack?.()} width={96} height={28}>Exit</L2Button>
      </div>

      <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: 8 }}>
        <L2Button onClick={() => cur && onStart?.(selected)} disabled={!cur} width={96} height={28}>Play</L2Button>
      </div>

      <div style={{ position: "absolute", right: 8, bottom: 8, display: "flex", gap: 8 }}>
        <L2Button onClick={() => onCreate?.()} width={110} height={28}>Create</L2Button>
        <L2Button onClick={() => cur && onDelete?.(selected)} disabled={!cur} width={110} height={28}>Delete</L2Button>
      </div>
    </div>
  );
}
