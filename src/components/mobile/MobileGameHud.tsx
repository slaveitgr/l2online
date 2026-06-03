import { useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from "react";

interface MobileGameHudProps {
  targetId?: number | null;
  onAttack?: () => void;
  onInteract?: () => void;
  onMove?: (dx: number, dy: number) => void;
  onSay?: (text: string) => void;
}

export function MobileGameHud({ targetId, onAttack, onInteract, onMove, onSay }: MobileGameHudProps) {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState("");

  return (
    <div className="fixed inset-0 z-40 pointer-events-none select-none mobile-game-hud">
      {/* Player panel top-left */}
      <div className="absolute top-3 left-3 w-[220px] l2-mobile-panel pointer-events-auto">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full border border-gold/60 bg-black/40 flex items-center justify-center text-gold font-bold">
            L
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-gold tracking-widest truncate">mslave</div>
            <div className="text-[10px] text-muted-foreground">Lv. 1 · Fighter</div>
          </div>
        </div>
        <Bar label="HP" value="100%" color="bg-red-600" />
        <Bar label="MP" value="100%" color="bg-blue-600" />
        <Bar label="CP" value="100%" color="bg-yellow-500" />
      </div>

      {/* Minimap top-right */}
      <div className="absolute top-3 right-3 pointer-events-auto">
        <div className="w-24 h-24 rounded-full border border-gold/70 bg-black/50 backdrop-blur-md shadow-xl flex items-center justify-center">
          <div className="w-20 h-20 rounded-full border border-white/10 bg-[radial-gradient(circle,#2b2418,#090807)] relative">
            <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[9px] text-gold">N</span>
            <span className="absolute left-1/2 top-1/2 w-2 h-2 rounded-full bg-gold -translate-x-1/2 -translate-y-1/2" />
            <span className="absolute left-[62%] top-[40%] w-1.5 h-1.5 rounded-full bg-red-500" />
            <span className="absolute left-[35%] top-[60%] w-1.5 h-1.5 rounded-full bg-green-500" />
          </div>
        </div>
      </div>

      {/* Chat bottom-left */}
      <div className="absolute left-3 bottom-3 pointer-events-auto">
        {chatOpen ? (
          <div className="w-[280px] l2-mobile-panel">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] text-gold tracking-widest">CHAT</span>
              <button
                onClick={() => setChatOpen(false)}
                className="text-xs text-muted-foreground"
                aria-label="Close chat"
              >
                ✕
              </button>
            </div>
            <div className="h-16 text-[10px] text-muted-foreground overflow-hidden mb-2">
              System: Welcome to L2 Online
            </div>
            <input
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && chatText.trim()) {
                  onSay?.(chatText.trim());
                  setChatText("");
                }
              }}
              className="w-full bg-black/40 border border-border rounded px-2 py-1 text-xs text-foreground outline-none focus:border-gold/60"
              placeholder="Tap to chat..."
            />
          </div>
        ) : (
          <button
            onClick={() => setChatOpen(true)}
            className="l2-mobile-panel px-3 py-2 text-xs text-muted-foreground"
          >
            💬 Tap to chat...
          </button>
        )}
      </div>

      {/* Joystick */}
      <VirtualJoystick onMove={onMove} />

      {/* Target panel bottom-center */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[300px] l2-mobile-panel pointer-events-auto">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded bg-black/50 border border-gold/40" />
          <div className="flex-1">
            <div className="text-xs text-gold">{targetId ? `Target #${targetId}` : "No target"}</div>
            <div className="h-1.5 bg-black/50 rounded mt-1 overflow-hidden">
              <div className="h-full w-full bg-red-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Action cluster bottom-right */}
      <div className="absolute right-4 bottom-4 pointer-events-auto">
        <div className="relative w-[210px] h-[170px]">
          <ActionButton className="absolute right-16 bottom-8 w-20 h-20 text-xl" onClick={onAttack}>
            ⚔
          </ActionButton>
          <ActionButton className="absolute right-0 bottom-[62px] w-14 h-14" onClick={onInteract}>
            ✋
          </ActionButton>
          <ActionButton className="absolute right-0 bottom-0 w-14 h-14">🧪</ActionButton>
          <ActionButton className="absolute right-28 bottom-0 w-12 h-12">1</ActionButton>
          <ActionButton className="absolute right-36 bottom-[48px] w-12 h-12">2</ActionButton>
          <ActionButton className="absolute right-28 bottom-[96px] w-12 h-12">3</ActionButton>
          <ActionButton className="absolute right-[76px] bottom-[120px] w-12 h-12">4</ActionButton>
        </div>
      </div>
    </div>
  );
}

function Bar({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="mt-1 grid grid-cols-[22px_1fr_38px] items-center gap-1 text-[9px]">
      <span className="text-muted-foreground">{label}</span>
      <div className="h-1.5 rounded bg-black/50 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: value }} />
      </div>
      <span className="text-muted-foreground text-right">{value}</span>
    </div>
  );
}

function ActionButton({
  children,
  className = "",
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border border-gold/60 bg-black/55 backdrop-blur-md text-gold shadow-xl active:scale-95 transition flex items-center justify-center ${className}`}
    >
      {children}
    </button>
  );
}

function VirtualJoystick({ onMove }: { onMove?: (dx: number, dy: number) => void }) {
  const baseRef = useRef<HTMLDivElement | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);

  const updateFromPointer = (e: RPointerEvent<HTMLDivElement>) => {
    const el = baseRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const max = rect.width / 2 - 14;
    const dist = Math.hypot(dx, dy);
    const k = dist > max ? max / dist : 1;
    const x = dx * k;
    const y = dy * k;
    setKnob({ x, y });
    onMove?.(x / max, y / max);
  };

  return (
    <div
      ref={baseRef}
      className="absolute left-6 bottom-20 w-32 h-32 rounded-full border border-gold/30 bg-black/30 backdrop-blur-sm pointer-events-auto flex items-center justify-center touch-none"
      onPointerDown={(e) => {
        setActive(true);
        e.currentTarget.setPointerCapture(e.pointerId);
        updateFromPointer(e);
      }}
      onPointerMove={(e) => {
        if (active) updateFromPointer(e);
      }}
      onPointerUp={() => {
        setActive(false);
        setKnob({ x: 0, y: 0 });
        onMove?.(0, 0);
      }}
      onPointerCancel={() => {
        setActive(false);
        setKnob({ x: 0, y: 0 });
        onMove?.(0, 0);
      }}
    >
      <div
        className="w-14 h-14 rounded-full border border-gold/60 bg-black/60 transition-transform"
        style={{ transform: `translate(${knob.x}px, ${knob.y}px) scale(${active ? 1.1 : 1})` }}
      />
    </div>
  );
}
