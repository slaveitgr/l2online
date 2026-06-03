/**
 * Authentic L2 gauge — uses the REAL client gauge sprites extracted from
 * L2UI_CT1.utx (Gauge_DF_Large_{HP,MP,CP,EXP}_{bg,fill}).
 *
 * Composed 3-part strips live in /public/hud/gauges/:
 *   HP_bg.png HP_fill.png  MP_bg.png MP_fill.png  CP_bg.png CP_fill.png  EXP_bg.png EXP_fill.png
 *
 * Renders the empty track (bg) with the colored fill clipped to `value` (0..1).
 * `width` accepts a number (px) or a CSS string like "100%" for full-width bars.
 */
type GaugeKind = "HP" | "MP" | "CP" | "EXP" | "VP";

export function L2Gauge({
  kind,
  value,
  width = 190,
  height = 16,
  label,
  num,
}: {
  kind: GaugeKind;
  value: number; // 0..1
  width?: number | string;
  height?: number;
  label?: string;
  num?: string;
}) {
  const pct = Math.max(0, Math.min(1, value || 0));
  const base = `/hud/gauges/${kind}`;
  const w = typeof width === "number" && width > 4096 ? "100%" : width; // 9999 sentinel → full width
  return (
    <div
      style={{
        position: "relative",
        width: w,
        height,
        backgroundImage: `url(${base}_bg.png)`,
        backgroundSize: "100% 100%",
        backgroundRepeat: "no-repeat",
        imageRendering: "auto",
      }}
    >
      <div style={{ position: "absolute", inset: 0, width: `${pct * 100}%`, overflow: "hidden" }}>
        <div
          style={{
            width: "100%",
            height: "100%",
            backgroundImage: `url(${base}_fill.png)`,
            backgroundSize: `${typeof w === "number" ? `${w}px` : w} 100%`,
            backgroundRepeat: "no-repeat",
          }}
        />
      </div>
      {label && (
        <span style={{ position: "absolute", left: 4, top: 0, lineHeight: `${height}px`, fontSize: 9, fontWeight: 700, color: "#fff", textShadow: "0 1px 1px #000" }}>
          {label}
        </span>
      )}
      {num && (
        <span style={{ position: "absolute", right: 4, top: 0, lineHeight: `${height}px`, fontSize: 9, color: "#fff", textShadow: "0 1px 1px #000" }}>
          {num}
        </span>
      )}
    </div>
  );
}
