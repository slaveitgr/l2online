import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { getGameConnection } from "@/lib/l2-protocol/game-client";

interface MobileGameHudProps {
  targetId?: number | null;
  onAttack?: () => void;
  onInteract?: () => void;
  onMove?: (dx: number, dy: number) => void;
  onSay?: (text: string) => void;
}

/**
 * Mobile in-game HUD — rebuilt from scratch following the
 * lineage_mobile_hud_system reference (cyan-glass cards, orange accents,
 * landscape layout with left bars + minimap, right action wheel, bottom hotbar).
 *
 * All UI is procedural HTML/CSS + inline SVG sprites — no screenshot crops.
 */
export function MobileGameHud({ targetId, onAttack, onInteract, onMove, onSay }: MobileGameHudProps) {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState("");
  const [autoHunt, setAutoHunt] = useState(false);
  const [muted, setMuted] = useState(false);
  const [chatLines, setChatLines] = useState<{ color: string; text: string }[]>([
    { color: "#ffd14a", text: "Welcome, hunter." },
  ]);

  // Live player stats
  const [player, setPlayer] = useState(() => {
    const p = getGameConnection()?.getPlayer?.();
    return p ? { name: p.name, level: p.level, hp: p.hp, mp: p.mp, hpMax: p.hp || 1, mpMax: p.mp || 1 } : null;
  });

  useEffect(() => {
    const i = setInterval(() => {
      const p = getGameConnection()?.getPlayer?.();
      if (p) setPlayer((prev) => ({
        name: p.name,
        level: p.level,
        hp: p.hp,
        mp: p.mp,
        hpMax: Math.max(prev?.hpMax ?? 0, p.hp || 1),
        mpMax: Math.max(prev?.mpMax ?? 0, p.mp || 1),
      }));
    }, 600);
    return () => clearInterval(i);
  }, []);

  const hpPct = player ? Math.round((player.hp / player.hpMax) * 100) : 100;
  const mpPct = player ? Math.round((player.mp / player.mpMax) * 100) : 100;

  function send() {
    const t = chatText.trim();
    if (!t) return;
    onSay?.(t);
    setChatLines((c) => [...c.slice(-30), { color: "#eef6ff", text: `${player?.name ?? "You"}: ${t}` }]);
    setChatText("");
  }

  return (
    <>
      <SpriteDefs />
      <div className="mhud fixed inset-0 z-40 pointer-events-none select-none text-[var(--mhud-text)]">
        {/* ============ TOP LEFT: HP/MP bars + buff row ============ */}
        <div className="absolute left-3 top-3 flex items-start gap-2 pointer-events-auto">
          <div className="mhud-card w-[244px] px-2.5 py-2">
            <BarRow label="HP" color="red" value={hpPct} text={player ? `${player.hp}/${player.hpMax}` : "—"} />
            <BarRow label="MP" color="blue" value={mpPct} text={player ? `${player.mp}/${player.mpMax}` : "—"} />
            <div className="grid grid-cols-3 text-[11px] text-[var(--mhud-dim)] mt-1">
              <span>{player?.level ?? 1}</span>
              <span className="text-center">0</span>
              <span className="text-right">8</span>
            </div>
          </div>
          <div className="mhud-card flex gap-1.5 p-1.5">
            <MiniBtn icon="i-target" />
            <MiniBtn icon="i-auto" />
            <MiniBtn icon="i-map" />
            <MiniBtn icon="i-quest" />
          </div>
        </div>

        {/* ============ MINIMAP ============ */}
        <div className="mhud-panel absolute left-3 top-[96px] w-[190px] p-2 pointer-events-auto">
          <div className="flex items-center justify-between text-[11px] text-[var(--mhud-dim)] mb-1.5">
            <span className="truncate">Common Abandoned Camp</span>
            <button className="mhud-ghost w-6 h-6 grid place-items-center"><Svg id="i-chevron" /></button>
          </div>
          <div className="relative h-[110px] rounded-xl overflow-hidden bg-gradient-to-br from-white/[0.08] to-white/[0.02]">
            <div className="absolute inset-0" style={{ background: "radial-gradient(circle at 72% 42%, rgba(255,183,79,.48), transparent 18%)" }} />
            <span className="absolute left-1/2 top-1/2 w-2.5 h-2.5 rounded-full bg-[var(--mhud-orange)] -translate-x-1/2 -translate-y-1/2 shadow-[0_0_0_3px_rgba(255,255,255,.16),0_0_22px_rgba(255,165,0,.5)]" />
            <span className="absolute left-[28%] top-[34%] w-1.5 h-1.5 rounded-full bg-red-500" />
            <span className="absolute left-[64%] top-[60%] w-1.5 h-1.5 rounded-full bg-red-500" />
          </div>
        </div>

        {/* ============ TOP RIGHT: resources + system icons ============ */}
        <div className="mhud-card absolute right-3 top-3 px-3 py-2 flex gap-3 items-center pointer-events-auto">
          <Resource dot="bg-white" value="0" />
          <Resource dot="bg-[#ffcc4d]" value="202,254" />
          <Resource dot="bg-[#caef6f]" value="300" />
          <Resource dot="bg-[#d0dbff]" value="33%" />
          <div className="flex gap-1.5 ml-2">
            <MiniBtn icon="i-bag" />
            <MiniBtn icon="i-quest" />
            <MiniBtn icon="i-settings" />
          </div>
        </div>

        {/* ============ TARGET STRIP ============ */}
        {targetId != null && (
          <div className="absolute top-[68px] left-1/2 -translate-x-1/2 w-[260px] mhud-card px-2 py-1.5 pointer-events-auto">
            <div className="text-[10px] text-red-300 tracking-wider mb-1">⚔ TARGET #{targetId}</div>
            <div className="mhud-bar mhud-bar-red"><i style={{ width: "100%" }} /></div>
          </div>
        )}

        {/* ============ LEFT RAIL ============ */}
        <div className="absolute left-3 top-[230px] flex flex-col gap-2.5 pointer-events-auto">
          <RailBtn icon="i-party" label="Party" />
          <RailBtn icon="i-chat" label="Chat" onClick={() => setChatOpen((v) => !v)} />
          <RailBtn icon="i-settings" label="Setup" />
        </div>

        {/* ============ JOYSTICK ============ */}
        <VirtualJoystick onMove={onMove} />

        {/* ============ BOTTOM LEFT META ============ */}
        <div className="mhud-card absolute left-3 bottom-3 px-3 py-2.5 flex gap-3 items-end pointer-events-auto">
          <div className="text-[42px] leading-none font-bold">{player?.level ?? 1}</div>
          <div className="flex flex-col gap-1">
            <div className="text-[var(--mhud-orange)] font-bold text-xs">78.02%</div>
            <div className="flex items-center gap-1.5 text-[var(--mhud-dim)] text-[10px]">
              <Svg id="i-camera" className="w-3.5 h-3.5" /><span>SHOULDER CAM</span>
            </div>
          </div>
        </div>

        {/* ============ RIGHT RAIL (action wheel) ============ */}
        <div className="absolute right-4 bottom-[120px] pointer-events-auto">
          <div className="relative w-[220px] h-[200px]">
            {/* Auto-hunt orbit */}
            <button
              onClick={() => setAutoHunt((v) => !v)}
              className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[72px] h-[72px] rounded-full grid place-items-center text-[10px] font-bold tracking-widest ${
                autoHunt ? "bg-[radial-gradient(circle_at_30%_30%,rgba(255,200,120,.55),rgba(120,40,8,.6))] border-[rgba(255,164,130,.5)] text-orange-100" : "mhud-action-btn text-[#e6d7b1]"
              } border`}
            >
              <div className="flex flex-col items-center leading-[1.05]"><span>AUTO</span><span>HUNT</span></div>
            </button>
            {/* Big attack */}
            <button onClick={onAttack} className="absolute right-0 bottom-0 w-[94px] h-[94px] rounded-full grid place-items-center border" style={{ color: "#ffd2bd", background: "radial-gradient(circle at 34% 26%, rgba(255,255,255,.18), rgba(105,16,8,.55)), linear-gradient(180deg, rgba(255,104,51,.7), rgba(120,25,9,.65))", borderColor: "rgba(255,164,130,.32)", boxShadow: "0 10px 24px rgba(0,0,0,.25)" }}>
              <Svg id="i-sword" className="w-9 h-9" />
            </button>
            {/* Skill arc */}
            <ActionBtn className="absolute right-[88px] bottom-[8px] w-14 h-14" onClick={onInteract}><Svg id="i-target" className="w-5 h-5" /></ActionBtn>
            <ActionBtn className="absolute right-[18px] bottom-[88px] w-14 h-14"><Svg id="i-auto" className="w-5 h-5" /></ActionBtn>
            <ActionBtn className="absolute right-[68px] bottom-[132px] w-14 h-14"><Svg id="i-potion" className="w-5 h-5" /></ActionBtn>
            <ActionBtn className="absolute right-[140px] bottom-[100px] w-12 h-12" onClick={() => setMuted((m) => !m)}><Svg id="i-volume" className="w-5 h-5" /></ActionBtn>
          </div>
        </div>

        {/* ============ BOTTOM HOTBAR ============ */}
        <div className="mhud-panel absolute left-1/2 -translate-x-1/2 bottom-3 px-2.5 py-2 flex gap-2.5 items-center pointer-events-auto">
          <RoundSlot icon="i-potion" count="3389" />
          <RoundSlot icon="i-potion" count="387" />
          <div className="flex gap-1.5">
            <SkillSlot icon="i-sword" active />
            <SkillSlot icon="i-food" />
            <SkillSlot icon="i-auto" />
            <SkillSlot icon="i-lock" locked />
            <SkillSlot icon="i-potion" count="387" />
            <SkillSlot icon="i-potion" count="9" />
            <SkillSlot ghost />
            <SkillSlot icon="i-map" count="10" />
          </div>
        </div>

        {/* ============ QUEST TOAST ============ */}
        <div className="mhud-panel absolute right-[72px] top-[180px] px-3.5 py-2.5 min-w-[210px] pointer-events-auto">
          <div className="text-[var(--mhud-quest)] font-bold text-sm mb-0.5">New Path</div>
          <div className="text-[var(--mhud-dim)] text-xs">Tarti (Training Zone) 0/1</div>
        </div>

        {/* ============ CHAT WINDOW ============ */}
        {chatOpen && (
          <div className="mhud-window absolute left-3 top-[100px] w-[min(360px,52vw)] pointer-events-auto flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 bg-white/[0.04]">
              <div className="flex gap-1.5">
                <button className="text-sm font-semibold text-white border-b-2 border-[var(--mhud-orange)] pb-1 px-2">Chat</button>
                <button className="text-sm text-[var(--mhud-dim)] px-2">Channel</button>
              </div>
              <button onClick={() => setChatOpen(false)} className="mhud-ghost w-8 h-8 grid place-items-center"><Svg id="i-close" /></button>
            </div>
            <div className="p-3 flex flex-col gap-2 h-[260px]">
              <div className="flex-1 rounded-xl border border-white/5 bg-black/30 p-2 overflow-y-auto text-xs space-y-1">
                {chatLines.map((l, i) => (
                  <div key={i} style={{ color: l.color }}>{l.text}</div>
                ))}
              </div>
              <div className="flex gap-1.5 items-center">
                <input
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send()}
                  placeholder="Say…"
                  className="flex-1 bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-[var(--mhud-cyan)]/60"
                />
                <button onClick={send} className="mhud-action-btn w-9 h-9 rounded-lg grid place-items-center text-[var(--mhud-cyan)]"><Svg id="i-send" className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        )}

        {muted && (
          <div className="absolute top-14 right-3 text-[10px] text-[var(--mhud-dim)] bg-black/40 px-2 py-0.5 rounded pointer-events-none">muted</div>
        )}
      </div>

      <style>{`
        .mhud {
          --mhud-text: #eef6ff;
          --mhud-dim: rgba(225,238,255,.68);
          --mhud-cyan: #70c8ff;
          --mhud-orange: #f39d2a;
          --mhud-quest: #ffd14a;
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
        .mhud-panel {
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          background: linear-gradient(180deg, rgba(5,12,22,.84), rgba(5,11,19,.58));
          border: 1px solid rgba(114,184,255,.18);
          box-shadow: 0 18px 48px rgba(0,0,0,.45), inset 0 1px rgba(255,255,255,.05);
          border-radius: 18px;
          color: var(--mhud-text);
        }
        .mhud-window {
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          background: linear-gradient(180deg, rgba(4,10,18,.88), rgba(4,10,18,.74));
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
        .mhud-bar { height: 12px; border-radius: 999px; background: rgba(255,255,255,.08); overflow: hidden; border: 1px solid rgba(255,255,255,.06); }
        .mhud-bar i { display:block; height:100%; border-radius: inherit; }
        .mhud-bar-red i { background: linear-gradient(90deg, #ff6d4c, #ff3c2f); }
        .mhud-bar-blue i { background: linear-gradient(90deg, #4ed0ff, #257eff); }
      `}</style>
    </>
  );
}

/* ----------------- Subcomponents ----------------- */

function BarRow({ label, color, value, text }: { label: string; color: "red" | "blue"; value: number; text: string }) {
  return (
    <div className="grid items-center gap-2 mb-1.5" style={{ gridTemplateColumns: "24px 1fr auto" }}>
      <span className="text-[11px] font-semibold text-[var(--mhud-dim)]">{label}</span>
      <div className={`mhud-bar mhud-bar-${color}`}><i style={{ width: `${value}%` }} /></div>
      <span className="text-[10px] text-white tabular-nums">{text}</span>
    </div>
  );
}

function MiniBtn({ icon }: { icon: string }) {
  return (
    <button className="mhud-ghost w-8 h-8 grid place-items-center"><Svg id={icon} className="w-4 h-4" /></button>
  );
}

function Resource({ dot, value }: { dot: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className={`w-3 h-3 rounded-full ${dot}`} />
      <b className="font-semibold">{value}</b>
    </div>
  );
}

function RailBtn({ icon, label, onClick }: { icon: string; label: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="w-[78px] py-2 rounded-2xl border border-white/10 bg-black/40 backdrop-blur flex flex-col items-center gap-1 text-[var(--mhud-dim)] hover:text-white transition">
      <Svg id={icon} className="w-5 h-5" />
      <span className="text-[11px]">{label}</span>
    </button>
  );
}

function ActionBtn({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className={`mhud-action-btn active:scale-95 transition ${className}`}>{children}</button>
  );
}

function RoundSlot({ icon, count }: { icon: string; count?: string }) {
  return (
    <button className="relative w-[54px] h-[54px] rounded-full grid place-items-center border border-white/10 bg-gradient-to-b from-white/10 to-white/[0.02] text-white">
      <Svg id={icon} className="w-6 h-6" />
      {count && <span className="absolute right-1 bottom-0.5 text-[10px] font-bold drop-shadow">{count}</span>}
    </button>
  );
}

function SkillSlot({ icon, count, active, locked, ghost }: { icon?: string; count?: string; active?: boolean; locked?: boolean; ghost?: boolean }) {
  return (
    <button className={`relative w-[58px] h-[58px] rounded-xl grid place-items-center border border-white/10 bg-gradient-to-b from-white/10 to-white/[0.02] text-white ${active ? "outline outline-2 outline-[rgba(255,157,72,.7)]" : ""} ${ghost ? "opacity-30" : ""} ${locked ? "text-white/30" : ""}`}>
      {icon && <Svg id={icon} className="w-6 h-6" />}
      {count && <span className="absolute right-1 bottom-0.5 text-[10px] font-bold drop-shadow">{count}</span>}
    </button>
  );
}

function Svg({ id, className }: { id: string; className?: string }) {
  return <svg className={className ?? "w-[18px] h-[18px]"} fill="currentColor"><use href={`#${id}`} /></svg>;
}

function SpriteDefs() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }} aria-hidden>
      <symbol id="i-chat" viewBox="0 0 24 24"><path d="M4 4h16v11H9l-5 5V4zm3 4v2h10V8H7zm0 4v2h7v-2H7z" /></symbol>
      <symbol id="i-party" viewBox="0 0 24 24"><path d="M9 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm7 1a3 3 0 1 1 0-6 3 3 0 0 1 0 6ZM2 20c0-3.3 3.6-6 8-6s8 2.7 8 6H2Zm16.3 0c-.2-1.4-.9-2.6-2.1-3.7 3.2.2 5.8 2 5.8 3.7h-3.7Z" /></symbol>
      <symbol id="i-settings" viewBox="0 0 24 24"><path d="m19.4 13 .1-1-.1-1 2.1-1.6-2-3.4-2.5 1a7.8 7.8 0 0 0-1.7-1l-.4-2.7h-4l-.4 2.7c-.6.2-1.2.6-1.7 1l-2.5-1-2 3.4L4.6 11a8.7 8.7 0 0 0 0 2l-2.1 1.6 2 3.4 2.5-1c.5.4 1.1.8 1.7 1l.4 2.7h4l.4-2.7c.6-.2 1.2-.6 1.7-1l2.5 1 2-3.4L19.4 13ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z" /></symbol>
      <symbol id="i-map" viewBox="0 0 24 24"><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm8 0v14l2 .7V5.7L11 5Zm-6 1.5v11.8l4-1.3V5.2L5 6.5Zm14 0-4 1.3v11.8l4-1.3V6.5Z" /></symbol>
      <symbol id="i-quest" viewBox="0 0 24 24"><path d="M6 2h9l5 5v15H6V2Zm8 1.5V8h4.5L14 3.5Zm-5 8h8v2H9v-2Zm0 4h8v2H9v-2Zm0-8h3v2H9V7.5Z" /></symbol>
      <symbol id="i-bag" viewBox="0 0 24 24"><path d="M7 7V6a5 5 0 0 1 10 0v1h3l-1.3 14H5.3L4 7h3Zm2 0h6V6a3 3 0 1 0-6 0v1Zm0 4h2v3H9v-3Zm4 0h2v3h-2v-3Z" /></symbol>
      <symbol id="i-sword" viewBox="0 0 24 24"><path d="M14.7 3h6.3v6.3l-2.2-2.2-4.1 4.1 2.2 2.2-1.4 1.4-2.2-2.2-1.6 1.6 1.7 1.7-1.4 1.4-1.7-1.7-5.7 5.7L2 19.3l5.7-5.7-1.8-1.7 1.4-1.4 1.7 1.7 1.6-1.6-2.2-2.2 1.4-1.4 2.2 2.2 4.1-4.1L14.7 3Z" /></symbol>
      <symbol id="i-target" viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10h-2a8 8 0 1 1-8-8V2Zm0 5a5 5 0 1 0 5 5h-2a3 3 0 1 1-3-3V7Zm0 2V2l7 3-7 7V9Z" /></symbol>
      <symbol id="i-volume" viewBox="0 0 24 24"><path d="M14 5v14l-5-4H5V9h4l5-4Zm2.5 4.2a4.4 4.4 0 0 1 0 5.6l1.4 1.4a6.4 6.4 0 0 0 0-8.4l-1.4 1.4Zm2.8-2.8a8.4 8.4 0 0 1 0 11.2l1.4 1.4a10.4 10.4 0 0 0 0-14l-1.4 1.4Z" /></symbol>
      <symbol id="i-auto" viewBox="0 0 24 24"><path d="M12 2 4 6v6c0 5 3.4 9.7 8 10 4.6-.3 8-5 8-10V6l-8-4Zm-3 6h2v8H9V8Zm4 0h2v8h-2V8Z" /></symbol>
      <symbol id="i-close" viewBox="0 0 24 24"><path d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4 6.4 5Z" /></symbol>
      <symbol id="i-chevron" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6-1.4-1.4 4.6-4.6-4.6-4.6L9 6Z" /></symbol>
      <symbol id="i-send" viewBox="0 0 24 24"><path d="M2 21 23 12 2 3v7l15 2-15 2v7Z" /></symbol>
      <symbol id="i-food" viewBox="0 0 24 24"><path d="M7 2h2v8H7V2Zm4 0h2v8h-2V2Zm6 0h2v8a4 4 0 0 1-4 4h-1v8h-2v-8h-1a4 4 0 0 1-4-4V2h2v8a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V2Z" /></symbol>
      <symbol id="i-potion" viewBox="0 0 24 24"><path d="M9 2h6v2l-1 2v2.3l4.3 6.5A4.5 4.5 0 0 1 14.5 22h-5A4.5 4.5 0 0 1 5.7 14.8L10 8.3V6L9 4V2Zm1.9 10.3-3.5 5.2a2.5 2.5 0 0 0 2.1 3.5h5a2.5 2.5 0 0 0 2.1-3.5l-3.5-5.2h-2.2Z" /></symbol>
      <symbol id="i-camera" viewBox="0 0 24 24"><path d="M8 5 10 3h4l2 2h4v14H4V5h4Zm4 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z" /></symbol>
      <symbol id="i-lock" viewBox="0 0 24 24"><path d="M7 10V7a5 5 0 0 1 10 0v3h2v11H5V10h2Zm2 0h6V7a3 3 0 0 0-6 0v3Z" /></symbol>
    </svg>
  );
}

function VirtualJoystick({ onMove }: { onMove?: (dx: number, dy: number) => void }) {
  const baseRef = useRef<HTMLDivElement | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);

  const update = (e: RPointerEvent<HTMLDivElement>) => {
    const el = baseRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const max = rect.width / 2 - 16;
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
      className="absolute left-8 bottom-[160px] w-[108px] h-[108px] rounded-full border-2 border-white/10 pointer-events-auto touch-none grid place-items-center"
      style={{ background: "radial-gradient(circle at 40% 40%, rgba(255,255,255,.08), rgba(255,255,255,.02))" }}
      onPointerDown={(e) => { setActive(true); e.currentTarget.setPointerCapture(e.pointerId); update(e); }}
      onPointerMove={(e) => active && update(e)}
      onPointerUp={() => { setActive(false); setKnob({ x: 0, y: 0 }); onMove?.(0, 0); }}
      onPointerCancel={() => { setActive(false); setKnob({ x: 0, y: 0 }); onMove?.(0, 0); }}
    >
      <div
        className="w-12 h-12 rounded-full border border-white/15 transition-transform"
        style={{
          background: "radial-gradient(circle at 35% 30%, rgba(255,255,255,.28), rgba(255,255,255,.04))",
          transform: `translate(${knob.x}px, ${knob.y}px) scale(${active ? 1.08 : 1})`,
        }}
      />
    </div>
  );
}
