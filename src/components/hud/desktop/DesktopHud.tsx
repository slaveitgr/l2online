/**
 * Desktop in-game HUD — faithful reconstruction of the Lineage 2 Windows
 * client HUD. Built on a virtual 1920×1080 stage that auto-scales to fit
 * the viewport, with every panel positioned at the exact pixel coordinates
 * captured in `l2_desktop_ui_elements_ultra_detailed_crops_v3/crop_metadata.json`.
 *
 * Static panel imagery comes from PNG crops of the real client placed in
 * `public/hud/desktop/`. Live, dynamic overlays (CP/HP/MP/VP gauges, names,
 * level, chat lines, EXP %) are rendered on top with the authentic
 * `L2Gauge` sprite renderer.
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

function ratio(cur = 0, max = 0) {
  return max > 0 ? Math.max(0, Math.min(1, cur / max)) : 0;
}
function expRatio(value = 0) {
  const v = value > 1 ? value / 100 : value;
  return Math.max(0, Math.min(1, v));
}

/* -------------------------------------------------------------------------- */
/* Player status panel — top-left (box 0,0 → ~260,90)                          */
/* -------------------------------------------------------------------------- */

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
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: 260,
        height: 90,
        padding: "6px 8px 4px 8px",
        background:
          "linear-gradient(180deg, rgba(16,17,19,0.85), rgba(8,9,10,0.78))",
        borderRight: "1px solid #2d2a22",
        borderBottom: "1px solid #2d2a22",
        boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
        pointerEvents: "auto",
      }}
    >
      {/* Name row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          height: 14,
          fontSize: 12,
          color: "#d7d0bd",
          textShadow: "1px 1px 0 #000",
        }}
      >
        <span
          style={{
            width: 14,
            height: 14,
            border: "1px solid #5d5238",
            background: "#0b0b0a",
            color: "#c9a84c",
            fontSize: 10,
            textAlign: "center",
            lineHeight: "12px",
          }}
        >
          {level}
        </span>
        <span style={{ flex: 1 }}>{name}</span>
      </div>

      {/* Bars: CP / HP / MP / VP */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "24px 1fr",
          rowGap: 1,
          columnGap: 3,
          marginTop: 2,
          fontSize: 10,
        }}
      >
        <BarRow label="CP" kind="CP" cur={cp} max={cpMax} />
        <BarRow label="HP" kind="HP" cur={hp} max={hpMax} />
        <BarRow label="MP" kind="MP" cur={mp} max={mpMax} />
        <BarRow label="VP" kind="EXP" cur={0} max={1} />
      </div>

      {/* Mini portrait squares (sun/moon + status), top-right of panel */}
      <div style={{ position: "absolute", top: 4, right: 4, display: "flex", gap: 2 }}>
        <div
          style={{
            width: 28,
            height: 28,
            border: "1px solid #5d5238",
            background:
              "radial-gradient(circle at 50% 50%, #f0d878 0%, #765a18 70%, #1b1710 100%)",
          }}
          title="Time of day"
        />
        <div
          style={{
            width: 28,
            height: 28,
            border: "1px solid #5d5238",
            background:
              "radial-gradient(circle at 50% 30%, #8a3030 0%, #2a0a0a 80%, #050505 100%)",
          }}
          title="Status"
        />
      </div>
    </div>
  );
}

function BarRow({
  label,
  kind,
  cur,
  max,
}: {
  label: string;
  kind: "CP" | "HP" | "MP" | "EXP";
  cur: number;
  max: number;
}) {
  return (
    <>
      <span style={{ color: "#cfc6b0", textShadow: "1px 1px 0 #000", lineHeight: "10px" }}>{label}</span>
      <L2Gauge
        kind={kind}
        value={ratio(cur, max)}
        width={188}
        height={10}
        num={kind === "EXP" ? "" : `${cur | 0}/${max | 0}`}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Generic panel image (positioned crop)                                       */
/* -------------------------------------------------------------------------- */

function PanelImg({
  src,
  x,
  y,
  w,
  h,
  alt,
  zIndex,
  interactive,
  children,
}: {
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
  alt: string;
  zIndex?: number;
  interactive?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        zIndex,
        pointerEvents: interactive ? "auto" : "none",
      }}
    >
      <img
        src={src}
        alt={alt}
        width={w}
        height={h}
        draggable={false}
        style={{ display: "block", width: w, height: h, userSelect: "none" }}
      />
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Chat / system log — bottom-left                                             */
/* -------------------------------------------------------------------------- */

function ChatLog({ lines }: { lines: HudChatLine[] }) {
  const visible = lines.slice(-12);
  return (
    <div
      style={{
        position: "absolute",
        left: 6,
        top: 720,
        width: 400,
        height: 270,
        padding: "6px 8px",
        background: "rgba(8,8,10,0.55)",
        borderTop: "1px solid #2d2a22",
        borderRight: "1px solid #2d2a22",
        fontSize: 11,
        lineHeight: 1.45,
        overflow: "hidden",
        pointerEvents: "auto",
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

/* -------------------------------------------------------------------------- */
/* Hotbar overlay — slot keybind labels                                        */
/* -------------------------------------------------------------------------- */
/* Hotbars crop is positioned at (660, 780), 650×220. Slot rows sit roughly at
 * y-offsets 66, 110, 154 inside the crop, 12 slots × 36px wide starting x≈74. */

const HOTBAR_KEYS_ROW1: (string | null)[] = ["F1", null, null, "F4", "F5", null, null, null, "F9", null, null, null];
const HOTBAR_KEYS_ROW3: string[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="];

function HotbarOverlay() {
  // Slot keybind labels (top-left corner of each slot)
  const labelStyle = (color = "#cfc6b0"): CSSProperties => ({
    position: "absolute",
    fontSize: 9,
    color,
    textShadow: "1px 1px 0 #000",
    pointerEvents: "none",
  });
  const slotX = 76; // first slot's left, inside crop
  const slotW = 39;
  const rowY = [66, 110, 154];

  return (
    <>
      {/* Row "2" label between rows 1 and 2 (page indicator) */}
      <div style={{ ...labelStyle("#8f8a7d"), left: 60, top: rowY[1] + 2, fontSize: 10 }}>2</div>
      {HOTBAR_KEYS_ROW1.map((k, i) =>
        k ? (
          <div key={`r1-${i}`} style={{ ...labelStyle(), left: slotX + i * slotW + 3, top: rowY[0] + 2 }}>
            {k}
          </div>
        ) : null,
      )}
      {HOTBAR_KEYS_ROW3.map((k, i) => (
        <div key={`r3-${i}`} style={{ ...labelStyle(), left: slotX + i * slotW + 3, top: rowY[2] + 2 }}>
          {k}
        </div>
      ))}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Bottom status bar overlay — EXP %, weight, currency                         */
/* -------------------------------------------------------------------------- */

function BottomBarOverlay({ expPct }: { expPct: number }) {
  const txt: CSSProperties = {
    position: "absolute",
    fontSize: 11,
    color: "#cfc6b0",
    textShadow: "1px 1px 0 #000",
    lineHeight: "20px",
    pointerEvents: "none",
  };
  return (
    <>
      <div style={{ ...txt, left: 6, top: 56, color: "#b5a273" }}>EXP</div>
      <div style={{ ...txt, left: 56, top: 56 }}>{(expPct * 100).toFixed(4)}%</div>
      <div style={{ ...txt, left: 160, top: 56, color: "#c9a84c" }}>200%</div>
      <div style={{ ...txt, left: 230, top: 56 }}>0</div>
      <div style={{ ...txt, left: 285, top: 56, color: "#8f8a7d" }}>Clan</div>
      <div style={{ ...txt, left: 325, top: 56, color: "#8f8a7d" }}>OFF</div>
      <div style={{ ...txt, right: 30, top: 56 }}>28/250</div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Event panel overlay — Kavliaris title + dynamic close                       */
/* -------------------------------------------------------------------------- */

function EventPanelOverlay({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: 8,
          top: 2,
          fontSize: 11,
          color: "#cfc6b0",
          textShadow: "1px 1px 0 #000",
          pointerEvents: "none",
        }}
      >
        Kavliaris
      </div>
      <button
        type="button"
        onClick={onClose}
        title="Close"
        style={{
          position: "absolute",
          right: 4,
          top: 2,
          width: 14,
          height: 14,
          background: "transparent",
          border: "none",
          color: "#cfc6b0",
          fontSize: 12,
          lineHeight: "12px",
          cursor: "pointer",
          pointerEvents: "auto",
        }}
      >
        ×
      </button>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Quest notification overlay                                                  */
/* -------------------------------------------------------------------------- */

function QuestNotifOverlay({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: 8,
          top: 2,
          fontSize: 11,
          color: "#cfc6b0",
          textShadow: "1px 1px 0 #000",
          pointerEvents: "none",
        }}
      >
        Quest Notification
      </div>
      <button
        type="button"
        onClick={onClose}
        title="Close"
        style={{
          position: "absolute",
          right: 4,
          top: 2,
          width: 14,
          height: 14,
          background: "transparent",
          border: "none",
          color: "#cfc6b0",
          fontSize: 12,
          lineHeight: "12px",
          cursor: "pointer",
          pointerEvents: "auto",
        }}
      >
        ×
      </button>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Right vertical rail — clickable hitboxes opening windows                    */
/* -------------------------------------------------------------------------- */

const RIGHT_RAIL_TARGETS: (XdatWindowKey | null)[] = [
  null, // 1 (diamond/decor)
  null,
  null,
  null,
  "inventory",
  "character",
  "skills",
  "quest",
  "map",
  "friends",
  "clan",
  "mail",
  "settings",
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
];

function RightRailHotspots({ onOpen }: { onOpen: (k: XdatWindowKey) => void }) {
  // Rail is 72px wide × ~1020 high. Buttons are ~40px tall stacked.
  const slotH = 42;
  return (
    <>
      {RIGHT_RAIL_TARGETS.map((target, i) => (
        <button
          key={i}
          type="button"
          onClick={() => target && onOpen(target)}
          title={target ?? ""}
          style={{
            position: "absolute",
            left: 0,
            top: i * slotH,
            width: 72,
            height: slotH,
            background: "transparent",
            border: "none",
            cursor: target ? "pointer" : "default",
            pointerEvents: target ? "auto" : "none",
          }}
        />
      ))}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Top center HUD ribbon — pkts + name                                         */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Root                                                                        */
/* -------------------------------------------------------------------------- */

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
  const exp = expRatio(activeChar?.expPct ?? 0);

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
      {/* 1. Player status (top-left) — authentic gauges */}
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

      {/* 5. Hotbars (660, 780) 650×220 */}
      <PanelImg src="/hud/desktop/hotbars.png" x={660} y={780} w={650} h={220} alt="Hotbars">
        <HotbarOverlay />
      </PanelImg>

      {/* 6. Bottom status bar (0, 1000) 1920×80 */}
      <PanelImg src="/hud/desktop/bottombar.png" x={0} y={1000} w={1920} h={80} alt="Bottom status bar">
        {/* EXP gauge live fill over the bar area */}
        <div style={{ position: "absolute", left: 32, top: 38, width: 110, height: 8 }}>
          <L2Gauge kind="EXP" value={exp} width={110} height={8} />
        </div>
        <BottomBarOverlay expPct={exp} />
      </PanelImg>

      {/* 7. Event panel (1490, 0) 235×240 */}
      {showEvent && (
        <PanelImg
          src="/hud/desktop/eventpanel.png"
          x={1490}
          y={0}
          w={235}
          h={240}
          alt="Event panel"
          interactive
        >
          <EventPanelOverlay onClose={() => setShowEvent(false)} />
        </PanelImg>
      )}

      {/* 8. Quest notification (1585, 365) 283×115 */}
      {showQuest && (
        <PanelImg
          src="/hud/desktop/questnotif.png"
          x={1585}
          y={365}
          w={283}
          h={115}
          alt="Quest notification"
          interactive
        >
          <QuestNotifOverlay onClose={() => setShowQuest(false)} />
        </PanelImg>
      )}

      {/* 9. Right vertical icon rail (1848, 0) 72×1020 */}
      <PanelImg
        src="/hud/desktop/rightrail.png"
        x={1848}
        y={0}
        w={72}
        h={1020}
        alt="Right rail"
        interactive
        zIndex={2}
      >
        <RightRailHotspots onOpen={(k) => setActiveXdat(k)} />
      </PanelImg>

      {/* 11. Bottom-right action menu (1450, 915) 470×165 */}
      <PanelImg
        src="/hud/desktop/actionmenu.png"
        x={1450}
        y={915}
        w={470}
        h={165}
        alt="Action menu"
      />

      {/* 12. Floating shortcut panel (1715, 735) 95×145 */}
      <PanelImg
        src="/hud/desktop/floatingshortcut.png"
        x={1715}
        y={735}
        w={95}
        h={145}
        alt="Floating shortcuts"
      />

      {/* Chat / system log (bottom-left) */}
      <ChatLog lines={chatLines ?? []} />

      {/* System menu + windows */}
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
