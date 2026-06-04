/**
 * Desktop in-game HUD — Lineage 2 Windows-client look, rebuilt with pure CSS
 * primitives (no PNG screenshot slabs). Sits on a virtual 1920×1080 stage
 * that auto-scales to the viewport.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { L2DesktopStage } from "@/components/hud/L2DesktopStage";
import { L2Gauge } from "@/components/hud/L2Gauge";
import { L2SystemMenu } from "@/components/hud/L2SystemMenu";
import { L2SettingsWindow, L2CalendarWindow, L2ExitDialog } from "@/components/hud/L2GameWindows";
import { L2XdatWindow, isXdatWindowKey, type XdatWindowKey } from "@/components/hud/L2XdatWindow";
import { getGameConnection, type GameEvent, type PlayerState } from "@/lib/l2-protocol/game-client";
import type { HudActiveChar, HudChatLine } from "@/components/hud/L2HudAuthentic";

interface DesktopHudProps {
  activeChar?: HudActiveChar;
  chatLines?: HudChatLine[];
  onExit?: () => void;
  onSendChat?: (text: string) => void;
}

const GOLD = "#c9a84c";
const GOLD_DIM = "#8a7430";
const TXT = "#d7d0bd";
const TXT_DIM = "#8f8a7d";
const LINE = "#3a3320";
const PANEL_BG =
  "linear-gradient(180deg, rgba(18,16,12,0.92) 0%, rgba(10,9,7,0.92) 100%)";
const PANEL_BG_DARK =
  "linear-gradient(180deg, rgba(10,9,7,0.96) 0%, rgba(4,4,3,0.96) 100%)";

const ratio = (c = 0, m = 0) => (m > 0 ? Math.max(0, Math.min(1, c / m)) : 0);
const expR = (v = 0) => {
  const x = v > 1 ? v / 100 : v;
  return Math.max(0, Math.min(1, x));
};

/* ───────────────────── Panel frame helper ───────────────────── */
function Panel({
  style,
  children,
  interactive,
}: {
  style: CSSProperties;
  children?: ReactNode;
  interactive?: boolean;
}) {
  return (
    <div
      style={{
        position: "absolute",
        background: PANEL_BG,
        border: `1px solid ${LINE}`,
        boxShadow:
          "inset 0 1px 0 rgba(255,220,140,0.06), 0 4px 14px rgba(0,0,0,0.55)",
        pointerEvents: interactive ? "auto" : "none",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function TitleBar({
  title,
  onClose,
}: {
  title: string;
  onClose?: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        height: 18,
        padding: "0 6px",
        background:
          "linear-gradient(180deg, #2a241a 0%, #15110a 100%)",
        borderBottom: `1px solid ${LINE}`,
        fontSize: 11,
        color: TXT,
        textShadow: "1px 1px 0 #000",
      }}
    >
      <span style={{ flex: 1 }}>{title}</span>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          style={{
            width: 14,
            height: 14,
            background: "transparent",
            border: `1px solid ${LINE}`,
            color: TXT,
            fontSize: 10,
            lineHeight: "12px",
            cursor: "pointer",
            padding: 0,
            pointerEvents: "auto",
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

/* ───────────────────── Slot grid (hotbar / shortcut) ───────────────────── */
function Slot({
  size = 32,
  label,
  icon,
  keyLabel,
}: {
  size?: number;
  label?: string;
  icon?: ReactNode;
  keyLabel?: string;
}) {
  return (
    <div
      title={label}
      style={{
        width: size,
        height: size,
        background:
          "radial-gradient(circle at 50% 35%, #1a1812 0%, #0a0907 80%)",
        border: `1px solid #2a2418`,
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.6)",
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: TXT,
        fontSize: 14,
      }}
    >
      {icon}
      {keyLabel && (
        <span
          style={{
            position: "absolute",
            left: 2,
            top: 1,
            fontSize: 8,
            color: GOLD,
            textShadow: "1px 1px 0 #000",
            lineHeight: 1,
          }}
        >
          {keyLabel}
        </span>
      )}
    </div>
  );
}

/* ───────────────────── 1. Player status (top-left) ───────────────────── */
function PlayerStatusPanel({
  name,
  level,
  hp,
  hpMax,
  mp,
  mpMax,
  cp,
  cpMax,
}: {
  name: string;
  level: number;
  hp: number;
  hpMax: number;
  mp: number;
  mpMax: number;
  cp: number;
  cpMax: number;
}) {
  return (
    <Panel
      interactive
      style={{
        left: 0,
        top: 0,
        width: 280,
        height: 92,
        padding: "6px 8px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          color: TXT,
          textShadow: "1px 1px 0 #000",
        }}
      >
        <span
          style={{
            minWidth: 18,
            height: 14,
            padding: "0 3px",
            border: `1px solid ${GOLD_DIM}`,
            background: "#0b0b0a",
            color: GOLD,
            fontSize: 10,
            textAlign: "center",
            lineHeight: "12px",
          }}
        >
          {level}
        </span>
        <span style={{ flex: 1, fontWeight: 600 }}>{name}</span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "20px 1fr",
          rowGap: 2,
          columnGap: 4,
          marginTop: 4,
        }}
      >
        <BarRow label="CP" kind="CP" cur={cp} max={cpMax} />
        <BarRow label="HP" kind="HP" cur={hp} max={hpMax} />
        <BarRow label="MP" kind="MP" cur={mp} max={mpMax} />
      </div>

      {/* sun/moon + status mini icons */}
      <div
        style={{
          position: "absolute",
          top: 4,
          right: 6,
          display: "flex",
          gap: 2,
        }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            border: `1px solid ${LINE}`,
            background:
              "radial-gradient(circle at 50% 50%, #f0d878 0%, #765a18 70%, #1b1710 100%)",
          }}
          title="Time"
        />
        <div
          style={{
            width: 18,
            height: 18,
            border: `1px solid ${LINE}`,
            background:
              "radial-gradient(circle at 50% 30%, #8a3030 0%, #2a0a0a 80%, #050505 100%)",
          }}
          title="Status"
        />
      </div>
    </Panel>
  );
}

function BarRow({
  label,
  kind,
  cur,
  max,
}: {
  label: string;
  kind: "CP" | "HP" | "MP";
  cur: number;
  max: number;
}) {
  return (
    <>
      <span
        style={{
          color: TXT_DIM,
          fontSize: 9,
          textShadow: "1px 1px 0 #000",
          lineHeight: "12px",
        }}
      >
        {label}
      </span>
      <L2Gauge
        kind={kind}
        value={ratio(cur, max)}
        width={236}
        height={12}
        num={`${cur | 0} / ${max | 0}`}
      />
    </>
  );
}

/* ───────────────────── 5. Hotbars (bottom-center) ───────────────────── */
function HotbarPanel() {
  const row1Keys = ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12"];
  const row2Keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="];
  const SLOT = 34;
  const GAP = 2;
  const ROW_W = 12 * SLOT + 11 * GAP;

  return (
    <Panel
      interactive
      style={{
        left: 1920 / 2 - (ROW_W + 60) / 2,
        top: 940,
        width: ROW_W + 60,
        padding: "4px 6px 6px 30px",
      }}
    >
      {/* left page indicator */}
      <div
        style={{
          position: "absolute",
          left: 4,
          top: 4,
          width: 22,
          height: SLOT * 2 + GAP,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          color: GOLD,
          fontSize: 11,
        }}
      >
        <div style={{ fontSize: 14, cursor: "pointer" }}>◆</div>
        <div style={{ color: TXT_DIM }}>1</div>
        <div style={{ fontSize: 14, cursor: "pointer" }}>◆</div>
      </div>

      {[row1Keys, row2Keys].map((row, ri) => (
        <div
          key={ri}
          style={{
            display: "flex",
            gap: GAP,
            marginTop: ri === 0 ? 0 : GAP,
          }}
        >
          {row.map((k, i) => (
            <Slot key={`${ri}-${i}`} size={SLOT} keyLabel={k} />
          ))}
        </div>
      ))}
    </Panel>
  );
}

/* ───────────────────── 6. Bottom status bar ───────────────────── */
function BottomStatusBar({ expPct }: { expPct: number }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 1040,
        width: 1920,
        height: 40,
        background: PANEL_BG_DARK,
        borderTop: `1px solid ${LINE}`,
        display: "flex",
        alignItems: "center",
        padding: "0 12px",
        gap: 14,
        fontSize: 11,
        color: TXT,
        textShadow: "1px 1px 0 #000",
        pointerEvents: "auto",
      }}
    >
      <span style={{ color: GOLD }}>EXP</span>
      <div style={{ width: 220 }}>
        <L2Gauge kind="EXP" value={expPct} width={220} height={10} />
      </div>
      <span>{(expPct * 100).toFixed(4)}%</span>
      <span style={{ color: GOLD }}>↑200%</span>
      <span style={{ color: TXT_DIM }}>|</span>
      <span style={{ color: TXT_DIM }}>Clan</span>
      <span style={{ color: TXT_DIM }}>OFF</span>
      <span style={{ flex: 1 }} />
      <span style={{ color: TXT_DIM }}>0/0/0</span>
      <span style={{ color: GOLD }}>⚖</span>
      <span>28 / 250</span>
    </div>
  );
}

/* ───────────────────── 7. Event panel (top-right) ───────────────────── */
function EventPanel({ onClose }: { onClose: () => void }) {
  return (
    <Panel
      interactive
      style={{ right: 80, top: 0, width: 230, height: 240, padding: 0 }}
    >
      <TitleBar title="Kavliaris" onClose={onClose} />
      <div style={{ padding: 8, fontSize: 11, color: TXT }}>
        <div style={{ color: TXT_DIM, marginBottom: 6 }}>Clan Alliance</div>
        <div
          style={{
            width: 88,
            height: 88,
            margin: "4px auto 8px",
            borderRadius: "50%",
            background:
              "conic-gradient(from -90deg, #c98a2a 0% 70%, #2a1a08 70% 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, #5a4218 0%, #1a1208 80%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: GOLD,
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            Stage 5
          </div>
        </div>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 10,
            color: TXT_DIM,
            marginBottom: 4,
          }}
        >
          <input type="checkbox" style={{ accentColor: GOLD }} />
          Not participating in event
        </label>
        <div style={{ color: GOLD, fontSize: 10, marginTop: 6 }}>
          Consolation Prize
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            marginTop: 2,
            fontSize: 10,
          }}
        >
          <div
            style={{
              width: 16,
              height: 16,
              background:
                "radial-gradient(circle, #f0c850 0%, #8a5a18 80%)",
              border: `1px solid ${LINE}`,
            }}
          />
          Fairy's Lucky Coin ×100
        </div>
        <div style={{ color: GOLD, fontSize: 10, marginTop: 6 }}>
          Available Rewards
        </div>
      </div>
    </Panel>
  );
}

/* ───────────────────── 8. Quest notification ───────────────────── */
function QuestNotification({ onClose }: { onClose: () => void }) {
  return (
    <Panel
      interactive
      style={{ right: 80, top: 365, width: 290, height: 116, padding: 0 }}
    >
      <TitleBar title="Quest Notification" onClose={onClose} />
      <div style={{ padding: 8, display: "flex", gap: 8 }}>
        <div
          style={{
            width: 60,
            height: 60,
            background:
              "linear-gradient(180deg, #4a3820 0%, #1a1208 100%)",
            border: `1px solid ${LINE}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: GOLD,
            fontSize: 22,
          }}
        >
          🏰
        </div>
        <div style={{ flex: 1, fontSize: 11, color: TXT }}>
          <div style={{ color: GOLD }}>New Path</div>
          <div style={{ color: TXT_DIM, marginTop: 4 }}>
            Tarti (Training Zone)
          </div>
          <div style={{ marginTop: 2 }}>0 / 1</div>
        </div>
      </div>
    </Panel>
  );
}

/* ───────────────────── 9. Right vertical rail ───────────────────── */
const RAIL_BUTTONS: { icon: string; label: string; target: XdatWindowKey | null }[] = [
  { icon: "⚔", label: "Inventory", target: "equipment" },
  { icon: "♦", label: "Character", target: "character" },
  { icon: "✦", label: "Skills", target: "skills" },
  { icon: "❓", label: "Quest", target: "quest" },
  { icon: "🗺", label: "Map", target: "map" },
  { icon: "★", label: "Action", target: null },
  { icon: "👥", label: "Friends", target: "contacts" },
  { icon: "▣", label: "Clan", target: "clan" },
  { icon: "✉", label: "Mail", target: "mailbox" },
  { icon: "⚙", label: "Macro", target: "macro" },
  { icon: "🛒", label: "Shop", target: null },
  { icon: "📦", label: "Collection", target: "collection" },
  { icon: "🌐", label: "Community", target: "community" },
];

function RightRail({ onOpen }: { onOpen: (k: XdatWindowKey) => void }) {
  return (
    <div
      style={{
        position: "absolute",
        right: 0,
        top: 100,
        width: 38,
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: 2,
        background: PANEL_BG_DARK,
        border: `1px solid ${LINE}`,
        pointerEvents: "auto",
      }}
    >
      {RAIL_BUTTONS.map((b, i) => (
        <button
          key={i}
          type="button"
          title={b.label}
          onClick={() => b.target && onOpen(b.target)}
          style={{
            width: 32,
            height: 32,
            background:
              "radial-gradient(circle at 50% 30%, #2a2418 0%, #0a0907 100%)",
            border: `1px solid #2a2418`,
            color: GOLD,
            fontSize: 14,
            cursor: b.target ? "pointer" : "default",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {b.icon}
        </button>
      ))}
    </div>
  );
}

/* ───────────────────── 11. Bottom-right action menu ───────────────────── */
function ActionMenu() {
  const items = ["⚗", "🗺", "❓", "⛏", "🐎", "⚙"];
  return (
    <Panel
      interactive
      style={{
        right: 0,
        top: 945,
        width: 168,
        padding: 4,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 3,
        }}
      >
        {items.map((ic, i) => (
          <Slot key={i} size={32} icon={<span>{ic}</span>} />
        ))}
      </div>
    </Panel>
  );
}

/* ───────────────────── 12. Floating shortcut ───────────────────── */
function FloatingShortcut() {
  return (
    <Panel
      interactive
      style={{
        right: 180,
        top: 800,
        width: 44,
        padding: 4,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {[0, 1, 2, 3].map((i) => (
          <Slot key={i} size={32} />
        ))}
      </div>
    </Panel>
  );
}

/* ───────────────────── Chat log (bottom-left) ───────────────────── */
function ChatLog({ lines }: { lines: HudChatLine[] }) {
  const visible = lines.slice(-10);
  return (
    <div
      style={{
        position: "absolute",
        left: 6,
        top: 820,
        width: 420,
        maxHeight: 210,
        padding: "6px 8px",
        background: "rgba(0,0,0,0.35)",
        border: `1px solid ${LINE}`,
        fontSize: 11,
        lineHeight: 1.4,
        color: TXT,
        pointerEvents: "auto",
        overflow: "hidden",
      }}
    >
      {visible.map((l, i) => (
        <div
          key={i}
          style={{
            color: l.color ?? "#a89e85",
            textShadow: "1px 1px 0 rgba(0,0,0,0.85)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {l.text}
        </div>
      ))}
    </div>
  );
}

/* ───────────────────── Root ───────────────────── */
export function DesktopHud({ activeChar, chatLines, onExit }: DesktopHudProps) {
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [hp, setHp] = useState({ cur: activeChar?.hp ?? 1, max: activeChar?.hpMax ?? activeChar?.hp ?? 1 });
  const [mp, setMp] = useState({ cur: activeChar?.mp ?? 1, max: activeChar?.mpMax ?? activeChar?.mp ?? 1 });
  const [cp, setCp] = useState({ cur: activeChar?.cp ?? 0, max: activeChar?.cpMax ?? activeChar?.cp ?? 1 });

  const [showEvent, setShowEvent] = useState(true);
  const [showQuest, setShowQuest] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeWindow, setActiveWindow] = useState<"settings" | "calendar" | null>(null);
  const [activeXdat, setActiveXdat] = useState<XdatWindowKey | null>(null);
  const [exitOpen, setExitOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.matches?.("input,textarea")) return;
      if (e.key.toLowerCase() === "x") setMenuOpen((v) => !v);
      if (e.key === "Escape") {
        setMenuOpen(false);
        setActiveWindow(null);
        setActiveXdat(null);
        setExitOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!activeChar) return;
    setHp({ cur: activeChar.hp ?? 1, max: activeChar.hpMax ?? activeChar.hp ?? 1 });
    setMp({ cur: activeChar.mp ?? 1, max: activeChar.mpMax ?? activeChar.mp ?? 1 });
    setCp({ cur: activeChar.cp ?? 0, max: activeChar.cpMax ?? activeChar.cp ?? 1 });
  }, [activeChar]);

  useEffect(() => {
    const conn = getGameConnection();
    const p0 = conn?.getPlayer?.();
    if (p0) {
      setPlayer(p0);
      setHp((s) => ({ cur: p0.hp, max: Math.max(s.max, p0.hp || 1) }));
      setMp((s) => ({ cur: p0.mp, max: Math.max(s.max, p0.mp || 1) }));
    }
    const off = conn?.addListener?.((ev: GameEvent) => {
      if (ev.type === "player") {
        setPlayer(ev.player);
        setHp((s) => ({ cur: ev.player.hp, max: Math.max(s.max, ev.player.hp || 1) }));
        setMp((s) => ({ cur: ev.player.mp, max: Math.max(s.max, ev.player.mp || 1) }));
      } else if (ev.type === "char-selected") {
        setPlayer((p) => ({ ...(p ?? ({} as PlayerState)), name: ev.name, objectId: ev.objectId, x: ev.x, y: ev.y, z: ev.z } as PlayerState));
      }
    });
    return () => {
      off?.();
    };
  }, []);

  const name = activeChar?.name ?? player?.name ?? "Hero";
  const level = activeChar?.level ?? player?.level ?? 1;
  const exp = expR(activeChar?.expPct ?? 0);

  const handleMenu = (key: string) => {
    if (key === "settings") {
      setActiveWindow("settings");
      setMenuOpen(false);
    } else if (key === "calendar") {
      setActiveWindow("calendar");
      setMenuOpen(false);
    } else if (key === "characters" || key === "exit") {
      setExitOpen(true);
      setMenuOpen(false);
    } else if (isXdatWindowKey(key)) {
      setActiveXdat(key);
      setMenuOpen(false);
    } else {
      setMenuOpen(false);
    }
  };

  return (
    <L2DesktopStage>
      <PlayerStatusPanel
        name={name}
        level={level}
        hp={hp.cur}
        hpMax={hp.max}
        mp={mp.cur}
        mpMax={mp.max}
        cp={cp.cur}
        cpMax={cp.max}
      />

      {showEvent && <EventPanel onClose={() => setShowEvent(false)} />}
      {showQuest && <QuestNotification onClose={() => setShowQuest(false)} />}

      <RightRail onOpen={(k) => setActiveXdat(k)} />

      <FloatingShortcut />
      <HotbarPanel />
      <ActionMenu />
      <BottomStatusBar expPct={exp} />

      <ChatLog lines={chatLines ?? []} />

      <div style={{ pointerEvents: "auto" }}>
        <L2SystemMenu open={menuOpen} onClose={() => setMenuOpen(false)} onSelect={handleMenu} />
        {activeWindow === "settings" && <L2SettingsWindow onClose={() => setActiveWindow(null)} />}
        {activeWindow === "calendar" && <L2CalendarWindow onClose={() => setActiveWindow(null)} />}
        {activeXdat && <L2XdatWindow windowKey={activeXdat} onClose={() => setActiveXdat(null)} />}
        {exitOpen && (
          <L2ExitDialog
            onExit={() => {
              setExitOpen(false);
              onExit?.();
            }}
            onCancel={() => setExitOpen(false)}
          />
        )}
      </div>
    </L2DesktopStage>
  );
}
