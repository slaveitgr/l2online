import { useEffect, useRef, useState, type ReactNode } from "react";

interface Props {
  title: string;
  initial: { x: number; y: number };
  width?: number;
  onClose: () => void;
  children: ReactNode;
}

export function HudWindow({ title, initial, width, onClose, children }: Props) {
  const [pos, setPos] = useState(initial);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    function move(e: MouseEvent) {
      if (!dragRef.current) return;
      setPos({ x: e.clientX - dragRef.current.dx, y: e.clientY - dragRef.current.dy });
    }
    function up() { dragRef.current = null; }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, []);

  return (
    <div
      className="l2-hud-frame absolute pointer-events-auto"
      style={{ left: pos.x, top: pos.y, width }}
    >
      <div
        className="l2-hud-title"
        onMouseDown={(e) => { dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }; }}
      >
        <span>{title}</span>
        <button className="l2-hud-close" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="p-2">{children}</div>
    </div>
  );
}
