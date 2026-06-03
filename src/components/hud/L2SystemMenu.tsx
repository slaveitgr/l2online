/**
 * L2 in-game System Menu (the radial/grid menu opened from the HUD or the X key).
 * Rebuilt 1:1 from the live Superion client: a top row of wide actions, a 6-column
 * icon grid, and a bottom bar (Community / Record Video · ? Edit · Settings /
 * Characters / Exit). Styled with the repo's l2-hud theme + gold-on-dark tiles.
 *
 *   <L2SystemMenu open={menuOpen} onClose={()=>setMenuOpen(false)} onSelect={handleMenu}/>
 *
 * `onSelect(key)` fires with the entry key (e.g. "teleport", "skills", "map").
 */
import {
  type CSSProperties,
} from "react";
import {
  Store, BadgeDollarSign, Coins, MapPin, User, Shield, Swords, Sparkles, ScrollText,
  Users, Map as MapIcon, Calendar, Brush, Contact, Mail, Hammer, DoorOpen, Search,
  BookOpen, Crown, FlaskConical, Flag, SquareTerminal, Gem, Settings as Cog,
  Video, MessageSquare, Power, UserCog, type LucideIcon,
} from "lucide-react";

interface Entry { key: string; label: string; icon: LucideIcon }

const TOP: Entry[] = [
  { key: "store", label: "Store", icon: Store },
  { key: "private-store-review", label: "Private Store Review", icon: BadgeDollarSign },
  { key: "adena-distribution", label: "Adena Distribution", icon: Coins },
];

const GRID: Entry[] = [
  { key: "teleport", label: "Teleport", icon: MapPin },
  { key: "character", label: "Character", icon: User },
  { key: "equipment", label: "Equipment", icon: Shield },
  { key: "actions", label: "Actions", icon: Swords },
  { key: "skills", label: "Skills", icon: Sparkles },
  { key: "quest", label: "Quest", icon: ScrollText },
  { key: "clan", label: "Clan", icon: Users },
  { key: "map", label: "Map", icon: MapIcon },
  { key: "calendar", label: "Calendar", icon: Calendar },
  { key: "tattoos", label: "Tattoos", icon: Brush },
  { key: "contacts", label: "Contacts", icon: Contact },
  { key: "mailbox", label: "Mailbox", icon: Mail },
  { key: "craft", label: "Craft", icon: Hammer },
  { key: "instance-zones", label: "Instance Zones", icon: DoorOpen },
  { key: "party-search", label: "Party Search", icon: Search },
  { key: "collection", label: "Collection", icon: BookOpen },
  { key: "tales-of-hero", label: "Tales of Hero", icon: BookOpen },
  { key: "session-zones", label: "Session Zones", icon: DoorOpen },
  { key: "olympiad", label: "Olympiad", icon: Crown },
  { key: "homunculi", label: "Homunculi", icon: FlaskConical },
  { key: "conquest", label: "Conquest", icon: Flag },
  { key: "macro", label: "Macro", icon: SquareTerminal },
  { key: "relics", label: "Relics", icon: Gem },
  { key: "settings", label: "Settings", icon: Cog },
];

function Tile({ e, onSelect }: { e: Entry; onSelect?: (k: string) => void }) {
  const Icon = e.icon;
  return (
    <button
      onClick={() => onSelect?.(e.key)}
      className="group flex flex-col items-center gap-1 w-[92px] py-2 hover:bg-[oklch(0.18_0.03_70/0.5)] transition-colors"
      style={{ background: "transparent", border: "none", cursor: "pointer" }}
    >
      <span style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, background: "radial-gradient(circle,#241c10,#0c0a06)", border: "1px solid #5a4a2a" }}>
        <Icon size={18} color="#d8b25a" />
      </span>
      <span style={{ fontSize: 10.5, color: "#cabf98", textShadow: "0 1px 1px #000", whiteSpace: "nowrap" }}>{e.label}</span>
    </button>
  );
}

export function L2SystemMenu({
  open, onClose, onSelect,
}: { open: boolean; onClose: () => void; onSelect?: (key: string) => void }) {
  if (!open) return null;
  const pick = (k: string) => { onSelect?.(k); };
  return (
    <div className="absolute pointer-events-auto z-50" style={{ right: 70, bottom: 70 }}>
      <div className="l2-hud-frame" style={{ width: 600, padding: 0 }}>
        {/* top wide actions */}
        <div style={{ display: "flex", gap: 2, padding: 8, borderBottom: "1px solid #3a3222" }}>
          {TOP.map((e) => {
            const Icon = e.icon;
            return (
              <button key={e.key} onClick={() => pick(e.key)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: 40, background: "linear-gradient(180deg,#241c10,#15110a)", border: "1px solid #5a4a2a", color: "#e6c87a", fontSize: 12, fontWeight: 700, cursor: "pointer", textShadow: "0 1px 1px #000" }}>
                <Icon size={18} color="#e6c87a" /> {e.label}
              </button>
            );
          })}
        </div>

        {/* 6-column icon grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", padding: 6 }}>
          {GRID.map((e) => <Tile key={e.key} e={e} onSelect={pick} />)}
        </div>

        {/* bottom bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: 8, borderTop: "1px solid #3a3222" }}>
          <button onClick={() => pick("community")} style={barBtn}><MessageSquare size={14} color="#cabf98" /> Community</button>
          <button onClick={() => pick("record-video")} style={barBtn}><Video size={14} color="#cabf98" /> Record Video</button>
          <span style={{ flex: 1 }} />
          <button onClick={() => pick("settings")} style={barBtn}><Cog size={14} color="#cabf98" /> Settings</button>
          <button onClick={() => pick("characters")} style={barBtn}><UserCog size={14} color="#cabf98" /> Characters</button>
          <button onClick={() => pick("exit")} style={{ ...barBtn, color: "#e08a6a" }}><Power size={14} color="#e08a6a" /> Exit</button>
        </div>
      </div>
    </div>
  );
}

const barBtn: CSSProperties = {
  display: "flex", alignItems: "center", gap: 6, height: 26, padding: "0 10px",
  background: "rgba(8,8,8,0.6)", border: "1px solid #4a4030", color: "#cabf98",
  fontSize: 11, fontWeight: 700, cursor: "pointer", textShadow: "0 1px 1px #000",
};
