/**
 * WorldPreloader — full-screen overlay shown after the user presses Play
 * while the world viewport streams in its first tile of L2 assets. Mirrors
 * the loading bar style of the original Lineage II client (gold bar over a
 * dark stone panel) so the transition between char-select and the world
 * feels native.
 */
import { useEffect, useState } from "react";

export interface WorldPreloaderProps {
  percent: number;
  message: string;
  charName?: string;
}

export function WorldPreloader({ percent, message, charName }: WorldPreloaderProps) {
  const [dots, setDots] = useState("");
  useEffect(() => {
    const t = setInterval(() => setDots((d) => (d.length >= 3 ? "" : d + ".")), 400);
    return () => clearInterval(t);
  }, []);

  const pct = Math.max(0, Math.min(100, percent));

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background:
          "radial-gradient(ellipse at center, #1a140c 0%, #0a0806 70%, #000 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: "#e6c87a",
        fontFamily: "'Times New Roman', serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          fontSize: 28,
          letterSpacing: 6,
          textTransform: "uppercase",
          textShadow: "0 0 12px rgba(230,200,122,0.4)",
          marginBottom: 8,
        }}
      >
        Lineage II
      </div>
      {charName && (
        <div style={{ fontSize: 14, color: "#c8b27a", marginBottom: 24, letterSpacing: 2 }}>
          Welcome, {charName}
        </div>
      )}

      <div
        style={{
          width: 460,
          maxWidth: "80vw",
          border: "1px solid #5a4a2a",
          background: "linear-gradient(180deg, #1c1610 0%, #0e0a07 100%)",
          padding: 3,
          boxShadow: "0 0 24px rgba(0,0,0,0.8), inset 0 0 8px rgba(0,0,0,0.9)",
        }}
      >
        <div
          style={{
            height: 18,
            background: "#0a0806",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background:
                "linear-gradient(180deg, #d8b864 0%, #a07e30 50%, #6e5418 100%)",
              boxShadow: "0 0 10px rgba(216,184,100,0.6)",
              transition: "width 200ms ease-out",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              color: "#f3e2a8",
              textShadow: "0 1px 2px rgba(0,0,0,0.9)",
              letterSpacing: 2,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {pct.toFixed(0)}%
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          fontSize: 12,
          color: "#9c906f",
          maxWidth: 460,
          textAlign: "center",
          letterSpacing: 1,
          minHeight: 18,
        }}
      >
        {message}
        {dots}
      </div>
    </div>
  );
}
