import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { getGameConnection } from "@/lib/l2-protocol/game-client";
import type { HudActiveChar, HudChatLine } from "@/components/hud/L2HudAuthentic";

interface MobileGameHudProps {
  targetId?: number | null;
  activeChar?: HudActiveChar;
  chatLines?: HudChatLine[];
  onAttack?: () => void;
  onInteract?: () => void;
  onMove?: (dx: number, dy: number) => void;
  onSay?: (text: string) => void;
  onExit?: () => void;
  packetCount?: number;
}

/**
 * Mobile in-game HUD — modern landscape layout that mirrors the desktop
 * XdatHud data (real player HP/MP, real chat, real target id) but with a
 * touch-first visual language: glass panels, virtual joystick, large attack
 * wheel, and a slide-in menu/system modal.
 */
export function MobileGameHud({
  targetId,
  activeChar,
  chatLines,
  onAttack,
  onInteract,
  onMove,
  onSay,
  onExit,
  packetCount,
}: MobileGameHudProps) {
  const [chatOpen, setChatOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatText, setChatText] = useState("");
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const hp = activeChar?.hp ?? 0;
  const hpMax = Math.max(1, activeChar?.hpMax ?? hp);
  const mp = activeChar?.mp ?? 0;
  const mpMax = Math.max(1, activeChar?.mpMax ?? mp);
  const cp = activeChar?.cp ?? 0;
  const cpMax = Math.max(1, activeChar?.cpMax ?? cp);
  const expPct = Math.round((activeChar?.expPct ?? 0));
  const hpPct = Math.round((hp / hpMax) * 100);
  const mpPct = Math.round((mp / mpMax) * 100);
  const cpPct = Math.round((cp / cpMax) * 100);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatLines, chatOpen]);

  function send() {
    const t = chatText.trim();
    if (!t) return;
    onSay?.(t);
    setChatText("");
  }

  return (
    <>
      <SpriteDefs />
      <div className="mhud fixed inset-0 z-40 pointer-events-none select-none text-[var(--mhud-text)]">
        {/* TOP LEFT — character status (CP/HP/MP) */}
        <div className="absolute left-3 top-3 pointer-events-auto">
          <div className="mhud-card w-[260px] px-3 py-2">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-md grid place-items-center bg-gradient-to-br from-amber-400/70 to-amber-700/70 text-[11px] font-bold text-black">
                  {activeChar?.level ?? "—"}
                </div>
                <div className="text-[12px] font-semibold truncate max-w-[150px]">
                  {activeChar?.name ?? "—"}
                </div>
              </div>
              <button
                onClick={() => setMenuOpen(true)}
                className="mhud-ghost w-7 h-7 grid place-items-center"
                aria-label="Menu"
              >
                <Svg id="i-settings" className="w-4 h-4" />
              </button>
            </div>
            <BarRow color="cp" value={cpPct} text={`${cp}`} label="CP" />
            <BarRow color="red" value={hpPct} text={`${hp}/${hpMax}`} label="HP" />
            <BarRow color="blue" value={mpPct} text={`${mp}/${mpMax}`} label="MP" />
          </div>
        </div>

        {/* TOP CENTER — target strip with name/HP from desktop game-state */}
        {targetId != null && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 mhud-card px-3 py-1.5 pointer-events-auto min-w-[200px]">
            <div className="text-[10px] text-red-300 tracking-wider mb-1">⚔ TARGET #{targetId}</div>
            <div className="mhud-bar mhud-bar-red"><i style={{ width: "100%" }} /></div>
          </div>
        )}

        {/* JOYSTICK */}
        <VirtualJoystick onMove={onMove} />

        {/* RIGHT — attack + interact wheel */}
        <div className="absolute right-4 bottom-[110px] pointer-events-auto">
          <div className="relative w-[180px] h-[170px]">
            <button
              onClick={onAttack}
              className="absolute right-0 bottom-0 w-[92px] h-[92px] rounded-full grid place-items-center border"
              style={{
                color: "#ffd2bd",
                background: "radial-gradient(circle at 34% 26%, rgba(255,255,255,.18), rgba(105,16,8,.55)), linear-gradient(180deg, rgba(255,104,51,.7), rgba(120,25,9,.65))",
                borderColor: "rgba(255,164,130,.32)",
                boxShadow: "0 10px 24px rgba(0,0,0,.25)",
              }}
              aria-label="Attack"
            >
              <Svg id="i-sword" className="w-9 h-9" />
            </button>
            <ActionBtn className="absolute right-[88px] bottom-[8px] w-14 h-14" onClick={onInteract}>
              <Svg id="i-target" className="w-5 h-5" />
            </ActionBtn>
            <ActionBtn className="absolute right-[18px] bottom-[88px] w-14 h-14" onClick={() => setChatOpen(true)}>
              <Svg id="i-chat" className="w-5 h-5" />
            </ActionBtn>
            <ActionBtn className="absolute right-[78px] bottom-[122px] w-12 h-12" onClick={() => setMenuOpen(true)}>
              <Svg id="i-settings" className="w-5 h-5" />
            </ActionBtn>
          </div>
        </div>

        {/* BOTTOM — EXP bar */}
        <div className="absolute left-0 right-0 bottom-0 h-1.5 bg-black/40 pointer-events-none">
          <div className="h-full bg-gradient-to-r from-amber-300 to-amber-500" style={{ width: `${expPct}%` }} />
        </div>

        {/* BOTTOM-LEFT — chat preview (tap to open full chat) */}
        <button
          onClick={() => setChatOpen(true)}
          className="absolute left-3 bottom-4 w-[280px] max-w-[40vw] text-left mhud-card px-2.5 py-2 pointer-events-auto"
          style={{ maxHeight: 120, overflow: "hidden" }}
        >
          <div className="text-[10px] text-[var(--mhud-dim)] mb-1 tracking-wider">CHAT — tap to open</div>
          <div className="text-[11px] leading-snug space-y-0.5">
            {(chatLines ?? []).slice(-3).map((l, i) => (
              <div key={i} style={{ color: l.color ?? "#cabf9b" }} className="truncate">
                {l.text}
              </div>
            ))}
            {(!chatLines || chatLines.length === 0) && (
              <div className="text-[var(--mhud-dim)] italic">No messages yet.</div>
            )}
          </div>
        </button>

        {/* CHAT MODAL */}
        {chatOpen && (
          <div className="absolute inset-0 z-10 bg-black/60 pointer-events-auto" onClick={() => setChatOpen(false)}>
            <div
              onClick={(e) => e.stopPropagation()}
              className="mhud-window absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(560px,88vw)] flex flex-col"
            >
              <ModalHeader title="Chat" onClose={() => setChatOpen(false)} />
              <div className="p-3 flex flex-col gap-2 h-[min(60vh,420px)]">
                <div
                  ref={chatScrollRef}
                  className="flex-1 rounded-xl border border-white/5 bg-black/30 p-2 overflow-y-auto text-xs space-y-1"
                >
                  {(chatLines ?? []).map((l, i) => (
                    <div key={i} style={{ color: l.color ?? "#cabf9b" }}>{l.text}</div>
                  ))}
                </div>
                <div className="flex gap-1.5 items-center">
                  <input
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && send()}
                    placeholder="Say something…"
                    className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--mhud-cyan)]/60"
                    autoFocus
                  />
                  <button
                    onClick={send}
                    className="mhud-action-btn w-10 h-10 rounded-lg grid place-items-center text-[var(--mhud-cyan)]"
                    aria-label="Send"
                  >
                    <Svg id="i-send" className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SYSTEM MENU MODAL */}
        {menuOpen && (
          <div className="absolute inset-0 z-10 bg-black/60 pointer-events-auto" onClick={() => setMenuOpen(false)}>
            <div
              onClick={(e) => e.stopPropagation()}
              className="mhud-window absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(420px,82vw)] flex flex-col"
            >
              <ModalHeader title="Menu" onClose={() => setMenuOpen(false)} />
              <div className="p-3 grid grid-cols-2 gap-2">
                <MenuTile
                  label="Inventory"
                  icon="i-bag"
                  onClick={() => {
                    setMenuOpen(false);
                  }}
                />
                <MenuTile
                  label="Skills"
                  icon="i-target"
                  onClick={() => {
                    setMenuOpen(false);
                  }}
                />
                <MenuTile
                  label="Map"
                  icon="i-map"
                  onClick={() => {
                    setMenuOpen(false);
                  }}
                />
                <MenuTile
                  label="Quests"
                  icon="i-quest"
                  onClick={() => {
                    setMenuOpen(false);
                  }}
                />
                <MenuTile
                  label="Party"
                  icon="i-party"
                  onClick={() => {
                    setMenuOpen(false);
                  }}
                />
                <MenuTile
                  label="Admin (//)"
                  icon="i-settings"
                  onClick={() => {
                    getGameConnection()?.sendBuildCmd?.("admin");
                    setMenuOpen(false);
                  }}
                />
                <MenuTile
                  label="Exit World"
                  icon="i-close"
                  danger
                  onClick={() => {
                    setMenuOpen(false);
                    onExit?.();
                  }}
                />
                <MenuTile label="Close" icon="i-close" onClick={() => setMenuOpen(false)} />
              </div>
              {packetCount != null && (
                <div className="px-3 pb-2 text-[10px] text-[var(--mhud-dim)] font-mono text-center">
                  pkts {packetCount}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`
        .mhud {
          --mhud-text: #eef6ff;
          --mhud-dim: rgba(225,238,255,.68);
          --mhud-cyan: #70c8ff;
          --mhud-orange: #f39d2a;
          font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        }
        .mhud-card {
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          background: linear-gradient(180deg, rgba(9,18,31,.74), rgba(7,15,24,.58));
          border: 1px solid rgba(114,184,255,.18);
          box-shadow: 0 8px 26px rgba(0,0,0,.24), inset 0 1px rgba(255,255,255,.05);
          border-radius: 14px;
          color: var(--mhud-text);
        }
        .mhud-window {
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          background: linear-gradient(180deg, rgba(4,10,18,.92), rgba(4,10,18,.82));
          border: 1px solid rgba(114,184,255,.42);
          border-radius: 22px;
          box-shadow: 0 18px 48px rgba(0,0,0,.55), inset 0 0 0 1px rgba(255,255,255,.04);
          color: var(--mhud-text);
          overflow: hidden;
        }
        .mhud-ghost {
          border: 1px solid rgba(255,255,255,.08);
          background: rgba(255,255,255,.04);
          color: var(--mhud-text);
          border-radius: 10px;
        }
        .mhud-action-btn {
          border: 1px solid rgba(255,255,255,.12);
          background: radial-gradient(circle at 30% 30%, rgba(255,255,255,.18), rgba(12,22,32,.4));
          box-shadow: 0 10px 24px rgba(0,0,0,.25);
          color: #e6d7b1;
          border-radius: 999px;
          display: grid;
          place-items: center;
        }
        .mhud-bar { height: 10px; border-radius: 999px; background: rgba(255,255,255,.08); overflow: hidden; border: 1px solid rgba(255,255,255,.06); }
        .mhud-bar i { display:block; height:100%; border-radius: inherit; }
        .mhud-bar-red i { background: linear-gradient(90deg, #ff6d4c, #ff3c2f); }
        .mhud-bar-blue i { background: linear-gradient(90deg, #4ed0ff, #257eff); }
        .mhud-bar-cp i { background: linear-gradient(90deg, #ffd97a, #d97a16); }
      `}</style>
    </>
  );
}

/* ----------------- Subcomponents ----------------- */

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 bg-white/[0.04]">
      <div className="text-sm font-semibold">{title}</div>
      <button onClick={onClose} className="mhud-ghost w-8 h-8 grid place-items-center" aria-label="Close">
        <Svg id="i-close" />
      </button>
    </div>
  );
}

function MenuTile({
  label,
  icon,
  onClick,
  danger,
}: {
  label: string;
  icon: string;
  onClick?: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border ${
        danger
          ? "border-red-400/40 bg-red-500/10 text-red-200"
          : "border-white/10 bg-white/[0.04] text-white"
      }`}
    >
      <Svg id={icon} className="w-5 h-5" />
      <span className="text-[11px]">{label}</span>
    </button>
  );
}

function BarRow({
  label,
  color,
  value,
  text,
}: {
  label: string;
  color: "red" | "blue" | "cp";
  value: number;
  text: string;
}) {
  return (
    <div className="grid items-center gap-2 mb-1" style={{ gridTemplateColumns: "22px 1fr auto" }}>
      <span className="text-[10px] font-semibold text-[var(--mhud-dim)]">{label}</span>
      <div className={`mhud-bar mhud-bar-${color}`}>
        <i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
      <span className="text-[10px] text-white tabular-nums">{text}</span>
    </div>
  );
}

function ActionBtn({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className={`mhud-action-btn active:scale-95 transition ${className}`}>
      {children}
    </button>
  );
}

function Svg({ id, className }: { id: string; className?: string }) {
  return (
    <svg className={className ?? "w-[18px] h-[18px]"} fill="currentColor">
      <use href={`#${id}`} />
    </svg>
  );
}

function SpriteDefs() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }} aria-hidden>
      <symbol id="i-chat" viewBox="0 0 24 24"><path d="M4 4h16v11H9l-5 5V4zm3 4v2h10V8H7zm0 4v2h7v-2H7z" /></symbol>
      <symbol id="i-party" viewBox="0 0 24 24"><path d="M9 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm7 1a3 3 0 1 1 0-6 3 3 0 0 1 0 6ZM2 20c0-3.3 3.6-6 8-6s8 2.7 8 6H2Z" /></symbol>
      <symbol id="i-settings" viewBox="0 0 24 24"><path d="m19.4 13 .1-1-.1-1 2.1-1.6-2-3.4-2.5 1a7.8 7.8 0 0 0-1.7-1l-.4-2.7h-4l-.4 2.7c-.6.2-1.2.6-1.7 1l-2.5-1-2 3.4L4.6 11a8.7 8.7 0 0 0 0 2l-2.1 1.6 2 3.4 2.5-1c.5.4 1.1.8 1.7 1l.4 2.7h4l.4-2.7c.6-.2 1.2-.6 1.7-1l2.5 1 2-3.4L19.4 13ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z" /></symbol>
      <symbol id="i-map" viewBox="0 0 24 24"><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Z" /></symbol>
      <symbol id="i-sword" viewBox="0 0 24 24"><path d="M14 3h7v7l-9 9-5 1 1-5 6-12Zm-9.7 13.3 3.4-3.4 1.4 1.4-3.4 3.4-1.4-1.4Z" /></symbol>
      <symbol id="i-target" viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 4a6 6 0 1 1-6 6 6 6 0 0 1 6-6Zm0 3a3 3 0 1 0 3 3 3 3 0 0 0-3-3Z" /></symbol>
      <symbol id="i-bag" viewBox="0 0 24 24"><path d="M6 7h12l-1 13H7L6 7Zm3-3a3 3 0 0 1 6 0v2h-2V4a1 1 0 0 0-2 0v2H9V4Z" /></symbol>
      <symbol id="i-quest" viewBox="0 0 24 24"><path d="M5 3h14v18l-7-3-7 3V3Z" /></symbol>
      <symbol id="i-close" viewBox="0 0 24 24"><path d="m6.4 5 12.6 12.6-1.4 1.4L5 6.4 6.4 5Zm12.6 0L6.4 17.6 5 16.2 17.6 3.6 19 5Z" /></symbol>
      <symbol id="i-send" viewBox="0 0 24 24"><path d="M2 21V3l20 9-20 9Zm2-3 12-6L4 6v4l8 2-8 2v4Z" /></symbol>
    </svg>
  );
}

function VirtualJoystick({ onMove }: { onMove?: (dx: number, dy: number) => void }) {
  const baseRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);
  const RADIUS = 56;

  function start(e: RPointerEvent<HTMLDivElement>) {
    (e.target as Element).setPointerCapture(e.pointerId);
    setActive(true);
    move(e);
  }
  function move(e: RPointerEvent<HTMLDivElement>) {
    const base = baseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > RADIUS) {
      dx = (dx / dist) * RADIUS;
      dy = (dy / dist) * RADIUS;
    }
    setKnob({ x: dx, y: dy });
    onMove?.(dx / RADIUS, -dy / RADIUS);
  }
  function end(e: RPointerEvent<HTMLDivElement>) {
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    setActive(false);
    setKnob({ x: 0, y: 0 });
    onMove?.(0, 0);
  }

  return (
    <div
      ref={baseRef}
      onPointerDown={start}
      onPointerMove={(e) => active && move(e)}
      onPointerUp={end}
      onPointerCancel={end}
      className="absolute left-4 bottom-[110px] w-[140px] h-[140px] rounded-full pointer-events-auto touch-none"
      style={{
        background: "radial-gradient(circle, rgba(255,255,255,.06), rgba(0,0,0,.4))",
        border: "1px solid rgba(255,255,255,.1)",
        boxShadow: "inset 0 0 20px rgba(0,0,0,.5)",
      }}
    >
      <div
        className="absolute left-1/2 top-1/2 w-12 h-12 rounded-full"
        style={{
          transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`,
          background: "radial-gradient(circle at 30% 30%, rgba(255,255,255,.5), rgba(112,200,255,.55))",
          border: "1px solid rgba(255,255,255,.3)",
          boxShadow: "0 4px 16px rgba(0,0,0,.4)",
          transition: active ? "none" : "transform 120ms ease",
        }}
      />
    </div>
  );
}
