/**
 * L2HudMockup — pixel-faithful port of the user-authored ingame HTML
 * prototype (l2-ingame-html-v3-pro). Renders a 1920x1080 stage with the real
 * client base screenshot and draggable sprite windows opened via hotspots.
 * Assets live in public/hud/mock/ingame/.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

const A = "/hud/mock/ingame";

interface WinDef {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  src: string;
  alt: string;
  dragHeight?: number; // px in 1920x1080 frame; default 42
  closeRight?: number;
  closeTop?: number;
  closeSize?: number;
}

const WINDOWS: WinDef[] = [
  { id: "welcomePanel", x: 0, y: 196, w: 313, h: 458, src: `${A}/welcome.png`, alt: "Welcome panel" },
  { id: "chatPanel", x: 0, y: 675, w: 400, h: 353, src: `${A}/chat.png`, alt: "Chat panel", dragHeight: 353, closeSize: 24, closeRight: 6, closeTop: 6 },
  { id: "stagePanel", x: 1515, y: 0, w: 195, h: 227, src: `${A}/stage-panel.png`, alt: "Stage panel", dragHeight: 227 },
  { id: "system", x: 1012, y: 495, w: 908, h: 447, src: `${A}/system-menu.png`, alt: "System menu", dragHeight: 72 },
  { id: "calendar", x: 438, y: 94, w: 996, h: 737, src: `${A}/calendar.png`, alt: "Calendar window" },
  { id: "settings", x: 542, y: 78, w: 813, h: 626, src: `${A}/settings.png`, alt: "Settings window" },
  { id: "exitWin", x: 1244, y: 488, w: 240, h: 412, src: `${A}/exit.png`, alt: "Exit window" },
];

const HOTSPOTS = [
  { toggle: "system", left: 1870, top: 978, w: 48, h: 64, title: "System Menu" },
  { toggle: "stagePanel", left: 1515, top: 0, w: 195, h: 227, title: "Event Window" },
  { toggle: "welcomePanel", left: 0, top: 196, w: 313, h: 458, title: "Welcome" },
  { toggle: "chatPanel", left: 0, top: 675, w: 400, h: 353, title: "Chat" },
];

const MENU_HITS: { open?: string; left: number; top: number; w: number; h: number; title: string }[] = [
  { open: "calendar", left: 342, top: 150, w: 80, h: 68, title: "Calendar" },
  { open: "settings", left: 755, top: 300, w: 80, h: 68, title: "Settings" },
  { open: "exitWin", left: 782, top: 377, w: 122, h: 36, title: "Exit" },
  { left: 655, top: 377, w: 126, h: 36, title: "Characters" },
  { left: 52, top: 377, w: 122, h: 36, title: "Edit" },
];

export interface HudActiveChar {
  name: string;
  level: number;
  klass?: string;
  race?: string;
  hp?: number;
  hpMax?: number;
  mp?: number;
  mpMax?: number;
  cp?: number;
  cpMax?: number;
  expPct?: number;
}

export interface HudChatLine {
  color?: string;
  text: string;
}

function StatusBox({ char }: { char: HudActiveChar }) {
  const pct = (v?: number, m?: number) =>
    !v || !m ? 0 : Math.max(0, Math.min(1, v / m));
  const bar = (
    color: string,
    value: number,
    label: string,
    cur?: number,
    max?: number,
  ) => (
    <div
      style={{
        position: "relative",
        height: 16,
        background: "#0a0907",
        border: "1px solid #2a241a",
        marginBottom: 2,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          width: `${value * 100}%`,
          background: color,
          transition: "width 200ms",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 6px",
          fontSize: 11,
          color: "#e6dcc0",
          textShadow: "0 1px 1px #000",
          lineHeight: "16px",
        }}
      >
        <span>{label}</span>
        <span>
          {cur ?? 0} / {max ?? 0}
        </span>
      </div>
    </div>
  );
  return (
    <div
      style={{
        position: "absolute",
        left: 10,
        top: 8,
        width: 230,
        padding: "6px 8px 8px",
        background: "rgba(8,8,6,0.55)",
        border: "1px solid #4a3f28",
        color: "#e6dcc0",
        fontFamily: "Tahoma, Geneva, sans-serif",
        fontSize: 12,
        textShadow: "0 1px 1px #000",
        zIndex: 5,
        pointerEvents: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
        <span style={{ color: "#c9a04a", fontWeight: 700 }}>{char.level}</span>
        <span style={{ fontWeight: 700 }}>{char.name}</span>
        {char.klass ? (
          <span style={{ marginLeft: "auto", color: "#9c906f", fontSize: 11 }}>
            {char.klass}
          </span>
        ) : null}
      </div>
      {bar(
        "linear-gradient(180deg,#d8c25a,#7a6420)",
        pct(char.cp, char.cpMax),
        "CP",
        char.cp,
        char.cpMax,
      )}
      {bar(
        "linear-gradient(180deg,#c8392f,#5e1612)",
        pct(char.hp, char.hpMax),
        "HP",
        char.hp,
        char.hpMax,
      )}
      {bar(
        "linear-gradient(180deg,#2f6cc8,#0f2a5e)",
        pct(char.mp, char.mpMax),
        "MP",
        char.mp,
        char.mpMax,
      )}
      {char.expPct != null ? (
        <div
          style={{
            marginTop: 4,
            height: 4,
            background: "#0a0907",
            border: "1px solid #2a241a",
          }}
        >
          <div
            style={{
              width: `${Math.max(0, Math.min(100, char.expPct))}%`,
              height: "100%",
              background: "linear-gradient(180deg,#c9a04a,#5e4612)",
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function ChatLog({ lines }: { lines: HudChatLine[] }) {
  if (lines.length === 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 14,
        top: 686,
        width: 372,
        height: 250,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        gap: 2,
        fontFamily: "Tahoma, Geneva, sans-serif",
        fontSize: 12,
        textShadow: "0 1px 1px #000",
        zIndex: 5,
        pointerEvents: "none",
      }}
    >
      {lines.slice(-12).map((l, i) => (
        <div key={i} style={{ color: l.color ?? "#d8d2bd" }}>
          {l.text}
        </div>
      ))}
    </div>
  );
}

export function L2HudMockup({
  onExit,
  activeChar,
  chatLines = [],
}: {
  onExit?: () => void;
  activeChar?: HudActiveChar;
  chatLines?: HudChatLine[];
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>({});
  const [scale, setScale] = useState(1);
  const stageRef = useRef<HTMLDivElement>(null);

  const openWin = useCallback((id: string) => {
    setOpen((s) => ({ ...s, [id]: true }));
    setOrder((o) => [...o.filter((x) => x !== id), id]);
  }, []);
  const closeWin = useCallback((id: string) => setOpen((s) => ({ ...s, [id]: false })), []);
  const toggleWin = useCallback((id: string) => {
    setOpen((s) => {
      const next = !s[id];
      if (next) setOrder((o) => [...o.filter((x) => x !== id), id]);
      return { ...s, [id]: next };
    });
  }, []);

  // Fit 1920x1080 stage to viewport
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  // Esc closes everything; X toggles system menu
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen({});
      else if (e.key.toLowerCase() === "x") toggleWin("system");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleWin]);

  const beginDrag = (id: string, startEvent: React.PointerEvent, def: WinDef) => {
    startEvent.preventDefault();
    const target = startEvent.currentTarget as HTMLElement;
    target.setPointerCapture(startEvent.pointerId);
    setOrder((o) => [...o.filter((x) => x !== id), id]);
    const base = pos[id] ?? { x: def.x, y: def.y };
    const sx = startEvent.clientX / scale;
    const sy = startEvent.clientY / scale;
    const move = (e: PointerEvent) => {
      const nx = base.x + (e.clientX / scale - sx);
      const ny = base.y + (e.clientY / scale - sy);
      setPos((p) => ({
        ...p,
        [id]: {
          x: Math.max(0, Math.min(1920 - def.w, nx)),
          y: Math.max(0, Math.min(1080 - def.h, ny)),
        },
      }));
    };
    const up = (e: PointerEvent) => {
      try { target.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const hotspotStyle = (left: number, top: number, w: number, h: number): CSSProperties => ({
    position: "absolute",
    left,
    top,
    width: w,
    height: h,
    background: "transparent",
    border: 0,
    padding: 0,
    cursor: "pointer",
  });

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", background: "#000", zIndex: 50 }}>
      <div
        ref={stageRef}
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 1920,
          height: 1080,
          transform: `translate(-50%, -50%) scale(${scale})`,
          transformOrigin: "center center",
          userSelect: "none",
          background: "#000",
        }}
      >
        <img
          src={`${A}/ingame-base.jpg`}
          alt=""
          style={{ position: "absolute", inset: 0, width: 1920, height: 1080, pointerEvents: "none" }}
        />

        {activeChar ? <StatusBox char={activeChar} /> : null}
        <ChatLog lines={chatLines} />



        {HOTSPOTS.map((h) => (
          <button
            key={h.toggle}
            type="button"
            title={h.title}
            onClick={() => toggleWin(h.toggle)}
            style={hotspotStyle(h.left, h.top, h.w, h.h)}
          />
        ))}

        {WINDOWS.map((def) => {
          if (!open[def.id]) return null;
          const z = 20 + order.indexOf(def.id);
          const p = pos[def.id] ?? { x: def.x, y: def.y };
          const dh = def.dragHeight ?? 42;
          return (
            <section
              key={def.id}
              style={{
                position: "absolute",
                left: p.x,
                top: p.y,
                width: def.w,
                height: def.h,
                zIndex: z,
                filter: "drop-shadow(0 0 12px rgba(0,0,0,0.65))",
              }}
            >
              <div
                onPointerDown={(e) => beginDrag(def.id, e, def)}
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 0,
                  height: dh,
                  zIndex: 2,
                  cursor: "move",
                }}
              />
              <img
                src={def.src}
                alt={def.alt}
                style={{ width: "100%", height: "100%", display: "block", pointerEvents: "none" }}
              />
              <button
                type="button"
                aria-label="close"
                onClick={() => closeWin(def.id)}
                style={{
                  position: "absolute",
                  right: def.closeRight ?? 7,
                  top: def.closeTop ?? 6,
                  width: def.closeSize ?? 34,
                  height: def.closeSize ?? 34,
                  border: 0,
                  background: "transparent",
                  zIndex: 3,
                  cursor: "pointer",
                }}
              />
              {def.id === "system" &&
                MENU_HITS.map((m, i) => (
                  <button
                    key={i}
                    type="button"
                    title={m.title}
                    onClick={() => {
                      if (m.title === "Exit" && onExit) onExit();
                      else if (m.open) openWin(m.open);
                    }}
                    style={{
                      ...hotspotStyle(m.left, m.top, m.w, m.h),
                      zIndex: 4,
                    }}
                  />
                ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
