import { useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from "react";

interface MobileGameHudProps {
  targetId?: number | null;
  onAttack?: () => void;
  onInteract?: () => void;
  onMove?: (dx: number, dy: number) => void;
  onSay?: (text: string) => void;
}

/**
 * Mobile HUD inspired by Lineage 2M's landscape layout:
 *  - top-left: avatar + HP/MP bars, level shield, location/minimap
 *  - top-center: currency / resource pills
 *  - top-right: pet card + system menu
 *  - left side: party / social pill
 *  - right side: vertical column of secondary icons (chat, sound, options)
 *  - right cluster: auto-hunt + attack + arc of skill buttons
 *  - bottom: hotbar with 8 item slots
 *  - bottom-left: FREE CAM + minor toggles
 */
export function MobileGameHud({ targetId, onAttack, onInteract, onMove, onSay }: MobileGameHudProps) {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState("");
  const [autoHunt, setAutoHunt] = useState(false);
  const [muted, setMuted] = useState(false);

  return (
    <div className="fixed inset-0 z-40 pointer-events-none select-none mobile-game-hud font-sans">
      {/* ============ TOP LEFT: player frame ============ */}
      <div className="absolute top-2 left-2 pointer-events-auto">
        <div className="flex items-center gap-2">
          {/* level shield */}
          <div className="relative w-10 h-12 flex items-center justify-center">
            <div className="absolute inset-0 bg-gradient-to-b from-gold/40 to-black/80 border border-gold/70 rounded-sm [clip-path:polygon(0_0,100%_0,100%_70%,50%_100%,0_70%)]" />
            <span className="relative text-[10px] text-gold font-bold">85</span>
          </div>
          {/* avatar + bars */}
          <div className="w-[200px] bg-black/55 backdrop-blur-sm border border-white/15 rounded-md px-2 py-1.5">
            <div className="flex items-center gap-1.5">
              <div className="w-7 h-7 rounded-full border border-gold/60 bg-gradient-to-br from-amber-900 to-black overflow-hidden flex items-center justify-center text-gold text-xs">L</div>
              <div className="flex-1">
                <Bar color="bg-gradient-to-r from-red-700 to-red-500" value="100%" thin />
                <Bar color="bg-gradient-to-r from-blue-700 to-blue-500" value="100%" thin />
              </div>
            </div>
          </div>
        </div>

        {/* minimap with location */}
        <div className="mt-2 w-[200px] h-[110px] rounded-md overflow-hidden border border-white/20 bg-[radial-gradient(circle_at_30%_40%,#3a2f1c,#0a0805)] relative">
          <div className="absolute top-1 left-1 flex items-center gap-1 bg-black/60 px-1.5 py-0.5 rounded text-[10px] text-gold">
            <span>📍</span>
            <span>Dion Village</span>
          </div>
          <span className="absolute left-1/2 top-1/2 w-2 h-2 rounded-full bg-gold -translate-x-1/2 -translate-y-1/2 shadow-[0_0_6px_rgba(212,175,55,0.9)]" />
          <span className="absolute left-[30%] top-[35%] w-1.5 h-1.5 rounded-full bg-red-500" />
          <span className="absolute left-[65%] top-[60%] w-1.5 h-1.5 rounded-full bg-red-500" />
          <span className="absolute left-[55%] top-[25%] w-1.5 h-1.5 rounded-full bg-green-400" />
          <span className="absolute top-0.5 right-1 text-[8px] text-gold/70">N</span>
        </div>
      </div>

      {/* ============ TOP CENTER: resource pills ============ */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 pointer-events-auto">
        <ResourcePill icon="🪙" value="2,763,791" />
        <ResourcePill icon="🎒" value="33%" />
        <ResourcePill icon="🦴" value="—" />
      </div>

      {/* ============ TOP RIGHT: pet + menu ============ */}
      <div className="absolute top-2 right-2 flex items-start gap-1.5 pointer-events-auto">
        <div className="w-[110px] bg-black/55 backdrop-blur-sm border border-white/15 rounded-md p-1.5">
          <div className="flex items-center gap-1.5">
            <div className="w-7 h-7 rounded border border-gold/60 bg-gradient-to-br from-stone-700 to-black flex items-center justify-center text-xs">🐺</div>
            <div className="flex-1">
              <div className="text-[9px] text-gold tracking-wider">Pet · Lv.50</div>
              <Bar color="bg-gradient-to-r from-red-700 to-red-500" value="100%" thin />
            </div>
          </div>
        </div>
        <IconBtn>☰</IconBtn>
      </div>

      {/* ============ LEFT SIDE: social ============ */}
      <div className="absolute left-2 top-1/2 -translate-y-1/2 flex flex-col gap-2 pointer-events-auto">
        <SidePill icon="👥" label="Party" />
        <IconBtn>💬</IconBtn>
        <IconBtn>🎯</IconBtn>
      </div>

      {/* Joystick (movement) */}
      <VirtualJoystick onMove={onMove} />

      {/* ============ TARGET STRIP top-center-lower ============ */}
      {targetId != null && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 w-[240px] bg-black/60 backdrop-blur-sm border border-red-900/60 rounded px-2 py-1 pointer-events-auto">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-black/50 border border-red-700/60 flex items-center justify-center text-xs">⚔</div>
            <div className="flex-1">
              <div className="text-[10px] text-red-300 tracking-wide">Target #{targetId}</div>
              <Bar color="bg-gradient-to-r from-red-800 to-red-500" value="100%" thin />
            </div>
          </div>
        </div>
      )}

      {/* ============ RIGHT SIDE: vertical icons column ============ */}
      <div className="absolute right-2 top-1/3 flex flex-col gap-2 pointer-events-auto">
        <IconBtn>⚙</IconBtn>
        <IconBtn>🗺</IconBtn>
        <IconBtn onClick={() => setMuted((m) => !m)}>{muted ? "🔇" : "🔊"}</IconBtn>
        <IconBtn>🎒</IconBtn>
      </div>

      {/* ============ BOTTOM RIGHT cluster: auto-hunt + attack arc ============ */}
      <div className="absolute right-3 bottom-20 pointer-events-auto">
        <div className="relative w-[230px] h-[190px]">
          {/* Auto Hunt center */}
          <button
            onClick={() => setAutoHunt((v) => !v)}
            className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[78px] h-[78px] rounded-full border-2 ${
              autoHunt ? "border-gold bg-gradient-to-br from-amber-600 to-amber-900" : "border-gold/70 bg-black/60"
            } backdrop-blur-md text-[10px] font-bold tracking-widest text-gold shadow-[0_0_20px_rgba(0,0,0,0.6)] flex flex-col items-center justify-center`}
          >
            <span>AUTO</span>
            <span>HUNT</span>
          </button>

          {/* Big attack */}
          <ActionButton
            className="absolute right-0 bottom-0 w-[78px] h-[78px] text-2xl bg-gradient-to-br from-red-700/80 to-red-950/90 border-red-500/70"
            onClick={onAttack}
          >
            ⚔
          </ActionButton>

          {/* Skill arc */}
          <ActionButton className="absolute right-[78px] bottom-2 w-12 h-12" onClick={onInteract}>1</ActionButton>
          <ActionButton className="absolute right-[14px] bottom-[78px] w-12 h-12">2</ActionButton>
          <ActionButton className="absolute right-[60px] bottom-[120px] w-12 h-12">3</ActionButton>
          <ActionButton className="absolute right-[130px] bottom-[100px] w-11 h-11">4</ActionButton>
          <ActionButton className="absolute right-[150px] bottom-[40px] w-10 h-10">5</ActionButton>
        </div>
      </div>

      {/* ============ BOTTOM CENTER: hotbar ============ */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 pointer-events-auto">
        <div className="flex items-center gap-1 bg-black/55 backdrop-blur-sm border border-white/15 rounded-md px-2 py-1.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <HotSlot key={i} index={i + 1} />
          ))}
        </div>
      </div>

      {/* ============ BOTTOM LEFT: free cam + chat toggle ============ */}
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 pointer-events-auto">
        <button className="px-3 py-1.5 rounded-full bg-black/55 backdrop-blur-sm border border-white/20 text-[10px] text-gold tracking-widest">
          🎥 FREE CAM
        </button>
        <IconBtn>👁</IconBtn>
        {chatOpen ? (
          <div className="w-[230px] bg-black/70 border border-gold/30 rounded p-1.5">
            <input
              autoFocus
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              onBlur={() => setChatOpen(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && chatText.trim()) {
                  onSay?.(chatText.trim());
                  setChatText("");
                  setChatOpen(false);
                }
              }}
              className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-foreground outline-none focus:border-gold/60"
              placeholder="Say..."
            />
          </div>
        ) : (
          <button onClick={() => setChatOpen(true)} className="px-3 py-1.5 rounded-full bg-black/55 backdrop-blur-sm border border-white/20 text-[10px] text-muted-foreground">
            💬 Chat
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */

function Bar({ color, value, thin }: { color: string; value: string; thin?: boolean }) {
  return (
    <div className={`${thin ? "h-1" : "h-1.5"} rounded bg-black/60 overflow-hidden mt-0.5 border border-white/5`}>
      <div className={`h-full ${color}`} style={{ width: value }} />
    </div>
  );
}

function ResourcePill({ icon, value }: { icon: string; value: string }) {
  return (
    <div className="flex items-center gap-1 bg-black/55 backdrop-blur-sm border border-white/15 rounded-full px-2 py-0.5 text-[10px] text-gold">
      <span>{icon}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function SidePill({ icon, label }: { icon: string; label: string }) {
  return (
    <button className="flex items-center gap-1.5 bg-black/55 backdrop-blur-sm border border-white/20 rounded-full pl-1.5 pr-3 py-1 text-[10px] text-gold">
      <span className="w-5 h-5 rounded-full bg-black/50 border border-gold/40 flex items-center justify-center text-[10px]">{icon}</span>
      {label}
    </button>
  );
}

function IconBtn({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-9 h-9 rounded-full border border-white/25 bg-black/55 backdrop-blur-sm text-gold/90 text-sm flex items-center justify-center active:scale-95 transition"
    >
      {children}
    </button>
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
      className={`rounded-full border border-gold/60 bg-black/55 backdrop-blur-md text-gold shadow-[0_4px_16px_rgba(0,0,0,0.6)] active:scale-95 transition flex items-center justify-center font-bold ${className}`}
    >
      {children}
    </button>
  );
}

function HotSlot({ index }: { index: number }) {
  return (
    <button className="relative w-10 h-10 rounded border border-white/20 bg-gradient-to-b from-stone-800/70 to-black/80 active:scale-95 transition">
      <span className="absolute top-0 left-1 text-[8px] text-gold/60 font-mono">{index}</span>
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
      className="absolute left-4 bottom-16 w-32 h-32 rounded-full border border-gold/30 bg-black/30 backdrop-blur-sm pointer-events-auto flex items-center justify-center touch-none"
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
