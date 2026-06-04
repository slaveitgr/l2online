import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { WorldViewport } from "@/components/WorldViewport";
import {
  type HudActiveChar,
  type HudChatLine,
} from "@/components/hud/L2HudAuthentic";
import { DesktopHud } from "@/components/hud/desktop/DesktopHud";

import { SpriteProvider } from "@/components/hud/L2Sprite";
import { MobileGameHud } from "@/components/mobile/MobileGameHud";
import { RotateDeviceOverlay } from "@/components/mobile/RotateDeviceOverlay";
import { WorldPreloader } from "@/components/WorldPreloader";
import { useIsMobileGame } from "@/hooks/useIsMobileGame";
import { lockLandscape } from "@/lib/mobile/orientation";
import {
  getGameConnection,
  setGameConnection,
  type GameEvent,
} from "@/lib/l2-protocol/game-client";
import {
  useSelectedTarget,
  getSelectedTarget,
  setSelectedTarget,
} from "@/lib/game-state";

export const Route = createFileRoute("/world")({
  head: () => ({
    meta: [
      { title: "World — L2Slave" },
      { name: "description", content: "Real-time WebGL rendering of L2 maps in the browser." },
    ],
  }),
  component: WorldPage,
});

interface StoredChar {
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
  expPercent?: number;
}

const MOVE_RADIUS = 800;
const MOVE_TICK_MS = 300;

function WorldPage() {
  const navigate = useNavigate();
  const [char, setChar] = useState<HudActiveChar | null>(null);
  const [chat, setChat] = useState<HudChatLine[]>([]);
  const [packetCount, setPacketCount] = useState(0);
  const { isMobile, isLandscape } = useIsMobileGame();
  const targetId = useSelectedTarget();
  const [ready, setReady] = useState(false);
  const [loadPct, setLoadPct] = useState(0);
  const [loadMsg, setLoadMsg] = useState("Initializing…");

  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => setReady(true), 20000);
    return () => clearTimeout(t);
  }, [ready]);

  const joyRef = useRef<{ dx: number; dy: number; timer: ReturnType<typeof setInterval> | null }>({
    dx: 0,
    dy: 0,
    timer: null,
  });

  useEffect(() => {
    let initial: StoredChar | null = null;
    try {
      const raw = sessionStorage.getItem("l2.activeChar");
      if (raw) initial = JSON.parse(raw) as StoredChar;
    } catch {
      /* ignore */
    }

    const conn = getGameConnection();
    if (!conn || !conn.connected) {
      navigate({ to: initial ? "/characters" : "/" });
      return;
    }

    if (initial) {
      setChar({
        name: initial.name,
        level: initial.level,
        klass: initial.klass,
        race: initial.race,
        hp: initial.hp,
        hpMax: initial.hpMax ?? initial.hp,
        mp: initial.mp,
        mpMax: initial.mpMax ?? initial.mp,
        cp: initial.cp,
        cpMax: initial.cpMax ?? initial.cp,
        expPct: initial.expPercent,
      });
    }

    setChat((c) => [
      ...c,
      {
        color: "#d8c25a",
        text: `You have entered the world${initial?.name ? ` as ${initial.name}` : ""}.`,
      },
    ]);

    const p0 = conn.getPlayer?.();
    if (p0) {
      setChar((prev) => ({
        ...(prev ?? { name: p0.name, level: p0.level }),
        name: p0.name,
        level: p0.level,
        hp: p0.hp,
        hpMax: Math.max(prev?.hpMax ?? 0, p0.hp || 1),
        mp: p0.mp,
        mpMax: Math.max(prev?.mpMax ?? 0, p0.mp || 1),
      }));
    }

    conn.setEventHandler((ev: GameEvent) => {
      if (ev.type === "world-packet") {
        setPacketCount((n) => n + 1);
      } else if (ev.type === "player") {
        setChar((prev) => ({
          ...(prev ?? { name: ev.player.name, level: ev.player.level }),
          name: ev.player.name,
          level: ev.player.level,
          hp: ev.player.hp,
          hpMax: Math.max(prev?.hpMax ?? 0, ev.player.hp || 1),
          mp: ev.player.mp,
          mpMax: Math.max(prev?.mpMax ?? 0, ev.player.mp || 1),
        }));
      } else if (ev.type === "in-world") {
        setChat((c) => [...c, { color: "#6cae5a", text: ev.message }]);
      } else if (ev.type === "status") {
        setChat((c) => [...c, { color: "#9c906f", text: ev.message }]);
      } else if (ev.type === "closed") {
        setGameConnection(null);
        setSelectedTarget(null);
        setChat((c) => [...c, { color: "#e06a6a", text: "Disconnected from game server." }]);
        setTimeout(() => navigate({ to: "/" }), 600);
      } else if (ev.type === "npc-remove") {
        if (getSelectedTarget() === ev.objectId) setSelectedTarget(null);
      }
    });
  }, [navigate]);

  useEffect(() => {
    if (isMobile) void lockLandscape();
  }, [isMobile]);

  useEffect(() => {
    return () => {
      if (joyRef.current.timer) clearInterval(joyRef.current.timer);
    };
  }, []);

  const handleJoystick = (dx: number, dy: number) => {
    const j = joyRef.current;
    j.dx = dx;
    j.dy = dy;
    const magnitude = Math.hypot(dx, dy);
    if (magnitude > 0.15) {
      if (!j.timer) {
        const tick = () => {
          const conn = getGameConnection();
          const p = conn?.getPlayer();
          if (!conn || !p) return;
          const mag = Math.hypot(j.dx, j.dy);
          if (mag <= 0.15) return;
          const tx = p.x + j.dx * MOVE_RADIUS;
          const ty = p.y - j.dy * MOVE_RADIUS;
          conn.sendMoveTo(Math.round(tx), Math.round(ty), p.z);
        };
        tick();
        j.timer = setInterval(tick, MOVE_TICK_MS);
      }
    } else if (j.timer) {
      clearInterval(j.timer);
      j.timer = null;
      const conn = getGameConnection();
      const p = conn?.getPlayer();
      if (conn && p) conn.sendMoveTo(p.x, p.y, p.z);
    }
  };

  function leaveWorld() {
    try {
      getGameConnection()?.disconnect();
    } catch {
      /* ignore */
    }
    setGameConnection(null);
    try {
      sessionStorage.removeItem("l2.activeChar");
    } catch {
      /* ignore */
    }
    navigate({ to: "/" });
  }

  function sendChat(text: string) {
    const conn = getGameConnection();
    if (!conn) return;
    conn.sendSay(text);
    setChat((c) => [
      ...c,
      { color: "#f6ecc8", text: `${char?.name ?? "You"}: ${text}` },
    ]);
  }

  return (
    <div className="fixed inset-0 bg-background overflow-hidden">
      <WorldViewport
        onTargetTap={(id) => getGameConnection()?.sendAction(id)}
        onGroundTap={(x, y, z) => getGameConnection()?.sendMoveTo(x, y, z)}
      />


      <SpriteProvider>
        {isMobile ? (
          isLandscape ? (
            <MobileGameHud
              targetId={targetId}
              onAttack={() => {
                const id = getSelectedTarget();
                if (id != null) getGameConnection()?.sendAttack(id);
              }}
              onInteract={() => {
                const id = getSelectedTarget();
                if (id != null) getGameConnection()?.sendAction(id);
              }}
              onMove={handleJoystick}
              onSay={(text) => getGameConnection()?.sendSay(text)}
            />
          ) : (
            <RotateDeviceOverlay />
          )
        ) : (
          <DesktopHud
            activeChar={char ?? undefined}
            chatLines={chat}
            onExit={leaveWorld}
            onSendChat={sendChat}
          />

        )}
      </SpriteProvider>

      <div className="absolute top-1.5 left-1/2 -translate-x-1/2 text-[8px] font-mono text-muted-foreground tracking-widest pointer-events-none z-50">
        L2SLAVE · {char?.name ?? "—"} · pkts {packetCount}
      </div>

      {!ready && (
        <WorldPreloader percent={loadPct} message={loadMsg} charName={char?.name} />
      )}
    </div>
  );
}
