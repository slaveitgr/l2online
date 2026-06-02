import { useEffect, useState } from "react";
import { HudWindow } from "./HudWindow";

type WindowKey = "inventory" | "skills" | "paperdoll" | "map" | "quest" | "social" | null;

const ACTION_KEYS = ["1","2","3","4","5","6","7","8","9","0","-","="];
const ACTIONS: Array<{ icon: string; hue: number; name: string } | null> = [
  { icon: "⚔", hue: 25, name: "Power Strike" },
  { icon: "✦", hue: 250, name: "Wind Strike" },
  { icon: "✚", hue: 145, name: "Heal" },
  { icon: "⛨", hue: 80, name: "Shield" },
  { icon: "☠", hue: 320, name: "Curse" },
  null, null, null, null, null,
  { icon: "▣", hue: 200, name: "Recall" },
  { icon: "✷", hue: 95, name: "Buff" },
];

const BUFFS = [
  { glyph: "W", hue: 145, t: "29m" },
  { glyph: "S", hue: 80, t: "29m" },
  { glyph: "H", hue: 250, t: "19m" },
  { glyph: "F", hue: 25, t: "19m" },
  { glyph: "B", hue: 95, t: "9m" },
];

const PAPERDOLL = [
  ["", "HELM", ""],
  ["NECK", "ARMOR", "EAR"],
  ["L.HAND", "BODY", "R.HAND"],
  ["GLOVE", "BELT", "RING"],
  ["", "BOOT", ""],
];

interface Props {
  charName: string;
  charLevel: number;
  onExit: () => void;
}

export function L2Hud({ charName, charLevel, onExit }: Props) {
  const [open, setOpen] = useState<Set<WindowKey>>(new Set());
  const [hp] = useState(0.82);
  const [mp] = useState(0.64);
  const [cp] = useState(0.91);
  const [xp] = useState(0.34);
  const [target, setTarget] = useState<{ name: string; level: number; hp: number } | null>({
    name: "Orc Warrior", level: charLevel + 2, hp: 0.58,
  });
  const [chat, setChat] = useState<Array<{ kind: string; text: string }>>([
    { kind: "sys", text: "Welcome to the world of L2Slave." },
    { kind: "self", text: "Hero: ready." },
    { kind: "sys", text: "You have entered Talking Island." },
  ]);
  const [chatInput, setChatInput] = useState("");

  function toggle(k: Exclude<WindowKey, null>) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }
  function close(k: Exclude<WindowKey, null>) {
    setOpen((prev) => { const n = new Set(prev); n.delete(k); return n; });
  }

  // Keyboard shortcuts (L2 defaults)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      const map: Record<string, Exclude<WindowKey, null>> = {
        i: "inventory", k: "skills", t: "paperdoll", m: "map", j: "quest", o: "social",
      };
      const k = map[e.key.toLowerCase()];
      if (k) { e.preventDefault(); toggle(k); }
      if (e.key === "Escape") setOpen(new Set());
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function sendChat(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim()) return;
    setChat((c) => [...c.slice(-50), { kind: "self", text: `${charName}: ${chatInput}` }]);
    setChatInput("");
  }

  return (
    <div className="absolute inset-0 pointer-events-none select-none" style={{ fontFamily: "var(--font-display)" }}>
      {/* Top-left: Self status frame */}
      <div className="l2-hud-frame absolute top-3 left-3 pointer-events-auto" style={{ width: 230 }}>
        <div className="flex items-center gap-2 p-2">
          <div className="l2-target-orb" style={{ width: 44, height: 44, background: "radial-gradient(circle at 30% 25%, oklch(0.6 0.14 80), oklch(0.1 0.04 60))" }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-gold text-[11px] tracking-widest truncate">{charName}</span>
              <span className="text-[9px] font-mono text-muted-foreground">Lv {charLevel}</span>
            </div>
            <div className="space-y-1 mt-1">
              <div className="l2-vital-bar"><span className="hp-fill" style={{ width: `${hp*100}%` }} /><span className="l2-vital-label">{Math.round(hp*100)}%</span></div>
              <div className="l2-vital-bar"><span className="mp-fill" style={{ width: `${mp*100}%` }} /><span className="l2-vital-label">{Math.round(mp*100)}%</span></div>
              <div className="l2-vital-bar" style={{ height: 5 }}><span className="cp-fill" style={{ width: `${cp*100}%` }} /></div>
            </div>
          </div>
        </div>
        {/* Buffs */}
        <div className="border-t border-[#4a3a22] px-2 py-2 flex flex-wrap gap-1.5">
          {BUFFS.map((b, i) => (
            <div key={i} className="l2-buff" style={{ ["--buff-hue" as never]: b.hue }} title={`Buff ${b.glyph}`}>
              {b.glyph}<span className="l2-buff-time">{b.t}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top-center: Target frame */}
      {target && (
        <div className="l2-hud-frame absolute top-3 left-1/2 -translate-x-1/2 pointer-events-auto" style={{ width: 260 }}>
          <div className="flex items-center gap-2 p-2">
            <div className="l2-target-orb" style={{ width: 42, height: 42 }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] tracking-widest text-[oklch(0.85_0.12_25)] truncate">{target.name}</span>
                <span className="text-[9px] font-mono text-muted-foreground">Lv {target.level}</span>
              </div>
              <div className="l2-vital-bar mt-1"><span className="hp-fill" style={{ width: `${target.hp*100}%` }} /><span className="l2-vital-label">{Math.round(target.hp*100)}%</span></div>
              <div className="text-[9px] font-mono text-muted-foreground mt-1 tracking-widest">HOSTILE · MONSTER</div>
            </div>
            <button className="l2-hud-close" onClick={() => setTarget(null)} aria-label="Deselect">×</button>
          </div>
        </div>
      )}

      {/* Top-right: Mini-map */}
      <div className="l2-hud-frame absolute top-3 right-3 pointer-events-auto" style={{ width: 180 }}>
        <div className="l2-hud-title"><span>Radar</span><div className="flex gap-1"><button className="l2-hud-close">−</button><button className="l2-hud-close">+</button></div></div>
        <div className="p-1">
          <div className="relative" style={{ height: 150, background: "radial-gradient(circle at 50% 50%, oklch(0.25 0.06 80 / 0.6), oklch(0.05 0.02 40 / 0.95))", border: "1px solid #4a3a22" }}>
            <div className="absolute inset-0 grid grid-cols-4 grid-rows-4 opacity-30" style={{ backgroundImage: "linear-gradient(oklch(0.5 0.06 80 / 0.3) 1px, transparent 1px), linear-gradient(90deg, oklch(0.5 0.06 80 / 0.3) 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-[oklch(0.78_0.14_80)] rounded-full" style={{ boxShadow: "0 0 6px oklch(0.78 0.14 80)" }} />
            <div className="absolute" style={{ left: "30%", top: "60%" }}><div className="w-1.5 h-1.5 bg-[oklch(0.6_0.22_25)] rounded-full" /></div>
            <div className="absolute" style={{ left: "70%", top: "35%" }}><div className="w-1.5 h-1.5 bg-[oklch(0.6_0.22_25)] rounded-full" /></div>
            <div className="absolute bottom-1 left-1 right-1 text-[8px] font-mono text-[oklch(0.78_0.14_80)] flex justify-between tracking-widest">
              <span>X 81234</span><span>Y 148902</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom: Action bar + system buttons */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-auto flex flex-col items-center gap-2">
        <div className="l2-hud-frame px-2 py-2 flex items-end gap-3">
          <div className="flex gap-1">
            {ACTIONS.map((a, i) => (
              <div key={i} className={`l2-slot ${a ? "filled" : ""}`} style={a ? ({ ["--slot-hue" as never]: a.hue }) : undefined} title={a?.name ?? "Empty"}>
                {a?.icon ?? ""}
                <span className="l2-slot-key">{ACTION_KEYS[i]}</span>
              </div>
            ))}
          </div>
          <div className="w-px self-stretch bg-[#4a3a22]" />
          <div className="grid grid-cols-3 gap-1">
            <SysBtn label="INV" active={open.has("inventory")} onClick={() => toggle("inventory")} />
            <SysBtn label="SKL" active={open.has("skills")} onClick={() => toggle("skills")} />
            <SysBtn label="CHR" active={open.has("paperdoll")} onClick={() => toggle("paperdoll")} />
            <SysBtn label="MAP" active={open.has("map")} onClick={() => toggle("map")} />
            <SysBtn label="QST" active={open.has("quest")} onClick={() => toggle("quest")} />
            <SysBtn label="SOC" active={open.has("social")} onClick={() => toggle("social")} />
          </div>
        </div>
        <div className="l2-hud-frame px-3 py-1 flex items-center gap-3 text-[9px] font-mono text-muted-foreground tracking-widest">
          <span>XP</span>
          <div className="l2-vital-bar w-72" style={{ height: 6 }}><span className="xp-fill" style={{ width: `${xp*100}%` }} /></div>
          <span className="text-[oklch(0.78_0.14_80)]">{(xp*100).toFixed(2)}%</span>
        </div>
      </div>

      {/* Bottom-left: Chat */}
      <div className="l2-hud-frame absolute bottom-3 left-3 pointer-events-auto" style={{ width: 360 }}>
        <div className="flex border-b border-[#4a3a22]">
          <div className="l2-tab active">All</div>
          <div className="l2-tab">Party</div>
          <div className="l2-tab">Clan</div>
          <div className="l2-tab">Trade</div>
        </div>
        <div className="l2-sysmsg px-2 py-2 h-32 overflow-y-auto space-y-0.5">
          {chat.map((m, i) => (
            <div key={i} className={m.kind === "self" ? "sm-self" : m.kind === "warn" ? "sm-warn" : "sm-sys"}>{m.text}</div>
          ))}
        </div>
        <form onSubmit={sendChat} className="flex border-t border-[#4a3a22]">
          <span className="px-2 py-1 text-[10px] tracking-widest text-[oklch(0.78_0.14_80)] self-center">[All]</span>
          <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} className="flex-1 bg-transparent text-[11px] font-mono px-1 py-1 outline-none text-foreground" placeholder="Type to chat…" />
        </form>
      </div>

      {/* Bottom-right: exit + clock */}
      <div className="absolute bottom-3 right-3 pointer-events-auto flex flex-col items-end gap-2">
        <div className="l2-hud-frame px-3 py-1 text-[10px] font-mono text-[oklch(0.78_0.14_80)] tracking-widest">
          {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · ONLINE
        </div>
        <button className="l2-button" onClick={onExit}>EXIT</button>
      </div>

      {/* Windows */}
      {open.has("inventory") && (
        <HudWindow title="Inventory" initial={{ x: 280, y: 100 }} width={280} onClose={() => close("inventory")}>
          <div className="flex gap-1 mb-2">
            {["All","Weapon","Armor","Etc","Quest"].map((t, i) => (
              <div key={t} className={`l2-tab ${i===0?"active":""}`}>{t}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }).map((_, i) => {
              const filled = i < 9;
              return (
                <div key={i} className={`l2-slot ${filled ? "filled" : ""}`} style={filled ? ({ ["--slot-hue" as never]: (i*40)%360 }) : undefined}>
                  {filled ? "◈" : ""}
                  {filled && i < 3 && <span className="l2-slot-count">{(i+1)*5}</span>}
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-[9px] font-mono text-muted-foreground tracking-widest border-t border-[#4a3a22] pt-1">
            <span>Weight 1840 / 86000</span>
            <span className="text-[oklch(0.78_0.14_80)]">Adena 24,503</span>
          </div>
        </HudWindow>
      )}

      {open.has("skills") && (
        <HudWindow title="Skills" initial={{ x: 320, y: 140 }} width={300} onClose={() => close("skills")}>
          <div className="flex gap-1 mb-2">
            {["Active","Passive","Toggle"].map((t, i) => (
              <div key={t} className={`l2-tab ${i===0?"active":""}`}>{t}</div>
            ))}
          </div>
          <div className="space-y-1 max-h-56 overflow-y-auto">
            {["Power Strike","Mortal Blow","Wind Strike","Heal","Shield","Curse Poison","Recall"].map((n, i) => (
              <div key={n} className="flex items-center gap-2 px-1 py-1 hover:bg-[oklch(0.20_0.04_60_/_0.5)] cursor-pointer">
                <div className="l2-slot filled" style={{ width: 26, height: 26, ["--slot-hue" as never]: (i*55)%360 }}>✦</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-gold tracking-wide truncate">{n}</div>
                  <div className="text-[9px] font-mono text-muted-foreground">Lv {i+1} · MP {12+i*3}</div>
                </div>
              </div>
            ))}
          </div>
        </HudWindow>
      )}

      {open.has("paperdoll") && (
        <HudWindow title="Character" initial={{ x: 360, y: 120 }} width={320} onClose={() => close("paperdoll")}>
          <div className="flex gap-3">
            <div className="grid grid-cols-3 gap-1">
              {PAPERDOLL.flat().map((label, i) => (
                <div key={i} className={`l2-paperdoll-slot ${label && i % 2 === 0 ? "filled" : ""}`}>
                  {label}
                </div>
              ))}
            </div>
            <div className="flex-1 text-[10px] font-mono space-y-1">
              <Stat label="STR" v="40" />
              <Stat label="DEX" v="30" />
              <Stat label="CON" v="43" />
              <Stat label="INT" v="21" />
              <Stat label="WIT" v="20" />
              <Stat label="MEN" v="25" />
              <div className="border-t border-[#4a3a22] my-1" />
              <Stat label="P. Atk" v="184" />
              <Stat label="M. Atk" v="92" />
              <Stat label="P. Def" v="218" />
              <Stat label="M. Def" v="146" />
              <Stat label="Speed" v="115" />
            </div>
          </div>
        </HudWindow>
      )}

      {open.has("map") && (
        <HudWindow title="World Map" initial={{ x: 240, y: 100 }} width={360} onClose={() => close("map")}>
          <div className="h-56 border border-[#4a3a22] bg-[oklch(0.10_0.02_40)] flex items-center justify-center text-[10px] tracking-widest text-muted-foreground">
            ELMORE · ADEN · GRACIA
          </div>
        </HudWindow>
      )}

      {open.has("quest") && (
        <HudWindow title="Quest Log" initial={{ x: 280, y: 160 }} width={300} onClose={() => close("quest")}>
          <div className="text-[10px] text-muted-foreground tracking-widest">No active quests.</div>
        </HudWindow>
      )}

      {open.has("social") && (
        <HudWindow title="Friends" initial={{ x: 320, y: 200 }} width={240} onClose={() => close("social")}>
          <div className="text-[10px] text-muted-foreground tracking-widest">Friend list is empty.</div>
        </HudWindow>
      )}
    </div>
  );
}

function SysBtn({ label, active, onClick }: { label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`l2-tab ${active ? "active" : ""}`}
      style={{ borderBottom: "1px solid #4a3a22", minWidth: 38 }}
    >
      {label}
    </button>
  );
}

function Stat({ label, v }: { label: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground tracking-widest">{label}</span>
      <span className="text-gold">{v}</span>
    </div>
  );
}
