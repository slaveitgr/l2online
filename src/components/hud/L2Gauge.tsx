import type { CSSProperties } from "react";

export type L2GaugeKind = "HP" | "MP" | "CP" | "EXP";

const FALLBACK: Record<L2GaugeKind, { from: string; to: string; text: string }> = {
  HP: { from: "#c94a37", to: "#7f1712", text: "#fff" },
  MP: { from: "#3776d5", to: "#123777", text: "#fff" },
  CP: { from: "#d2ab28", to: "#73500a", text: "#161008" },
  EXP: { from: "#c18d25", to: "#6d4a09", text: "#fff" },
};

interface L2GaugeProps {
  kind: L2GaugeKind;
  value: number;
  max?: number;
  width?: number;
  height?: number;
  label?: string;
  num?: string;
  className?: string;
  style?: CSSProperties;
}

export function L2Gauge({
  kind,
  value,
  max = 1,
  width = 190,
  height = 16,
  label,
  num,
  className,
  style,
}: L2GaugeProps) {
  const pct = Math.max(0, Math.min(1, max ? value / max : 0));
  const base = `/hud/gauges/${kind}`;
  const fallback = FALLBACK[kind];

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width,
        height,
        overflow: "hidden",
        backgroundColor: "#070705",
        backgroundImage: `url(${base}_bg.png)`,
        backgroundSize: "100% 100%",
        backgroundRepeat: "no-repeat",
        borderRadius: 1,
        imageRendering: "auto",
        ...style,
      }}
    >
      <div style={{ position: "absolute", inset: 0, width: `${pct * 100}%`, overflow: "hidden" }}>
        <div
          style={{
            width,
            height,
            backgroundColor: fallback.to,
            backgroundImage: `url(${base}_fill.png), linear-gradient(180deg, ${fallback.from}, ${fallback.to})`,
            backgroundSize: `${width}px 100%, 100% 100%`,
            backgroundRepeat: "no-repeat",
          }}
        />
      </div>
      {label && (
        <span
          style={{
            position: "absolute",
            left: 4,
            top: 0,
            lineHeight: `${height}px`,
            fontSize: 10,
            fontWeight: 700,
            color: fallback.text,
            textShadow: fallback.text === "#fff" ? "0 1px 1px #000" : "none",
          }}
        >
          {label}
        </span>
      )}
      {num && (
        <span
          style={{
            position: "absolute",
            right: 4,
            top: 0,
            lineHeight: `${height}px`,
            fontSize: 10,
            color: "#fff",
            textShadow: "0 1px 1px #000",
          }}
        >
          {num}
        </span>
      )}
    </div>
  );
}
