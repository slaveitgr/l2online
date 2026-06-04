import { useEffect, useState, type ReactNode } from "react";

/**
 * Virtual 1920×1080 stage. All HUD children inside use absolute pixel
 * coordinates matching the reference screenshot, and the whole stage is
 * uniformly scaled (no distortion) to fit the current viewport. The 3D
 * world continues to fill the actual viewport behind this stage.
 */
export function L2DesktopStage({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    function recompute() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const s = Math.min(w / 1920, h / 1080);
      setScale(s);
      setOffset({ x: (w - 1920 * s) / 2, y: (h - 1080 * s) / 2 });
    }
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 40,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: offset.x,
          top: offset.y,
          width: 1920,
          height: 1080,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          fontFamily: "Tahoma, Geneva, sans-serif",
          color: "#d7d0bd",
        }}
      >
        {children}
      </div>
    </div>
  );
}
