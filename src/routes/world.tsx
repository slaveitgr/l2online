import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { WorldViewport } from "@/components/WorldViewport";
import { L2HudMockup } from "@/components/hud/L2HudMockup";
import { SpriteProvider } from "@/components/hud/L2Sprite";
import { MobileGameHud } from "@/components/mobile/MobileGameHud";
import { RotateDeviceOverlay } from "@/components/mobile/RotateDeviceOverlay";
import { useIsMobileGame } from "@/hooks/useIsMobileGame";
import { lockLandscape } from "@/lib/mobile/orientation";
import { getGameConnection, setGameConnection, type GameEvent } from "@/lib/l2-protocol/game-client";
import { useSelectedTarget, getSelectedTarget, setSelectedTarget } from "@/lib/game-state";

export const Route = createFileRoute("/world")({
  head: () => ({
    meta: [
      { title: "World — L2Slave" },
      { name: "description", content: "Real-time WebGL rendering of L2 maps in the browser." },
    ],
  }),
  component: WorldPage,
});

interface ActiveChar { name: string; level: number; klass?: string; race?: string }

// L2 units per joystick tick. ~800 = a few seconds of run.
const MOVE_RADIUS = 800;
const MOVE_TICK_MS = 300;

function WorldPage() {
  const navigate = useNavigate();
  const [, setChar] = useState<ActiveChar>({ name: "Hero", level: 1 });
  const [packetCount, setPacketCount] = useState(0);
  const { isMobile, isLandscape } = useIsMobileGame();
  const targetId = useSelectedTarget();

  // Joystick throttle state — lives across renders.
  const joyRef = useRef<{ dx: number; dy: number; timer: ReturnType<typeof setInterval> | null }>({
    dx: 0,
    dy: 0,
    timer: null,
  });

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("l2.activeChar");
      if (raw) setChar(JSON.parse(raw));
    } catch { /* ignore */ }

    const conn = getGameConnection();
    if (!conn || !conn.connected) {
      navigate({ to: "/" });
      return;
    }
    conn.setEventHandler((ev: GameEvent) => {
      if (ev.type === "world-packet") {
        setPacketCount((n) => n + 1);
      } else if (ev.type === "closed") {
        setGameConnection(null);
        setSelectedTarget(null);
      } else if (ev.type === "npc-remove") {
        if (getSelectedTarget() === ev.objectId) setSelectedTarget(null);
      }
    });
  }, [navigate]);

  useEffect(() => {
    if (isMobile) void lockLandscape();
  }, [isMobile]);

  // Cleanup joystick timer on unmount.
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
          // L2: x east, y north. Joystick: dx right, dy down (screen).
          // Treat screen-down as "into the world" (north) so up-on-stick moves forward.
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
      // Stop: tell server to move to current position.
      const conn = getGameConnection();
      const p = conn?.getPlayer();
      if (conn && p) conn.sendMoveTo(p.x, p.y, p.z);
    }
  };

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
          <L2HudMockup onExit={() => navigate({ to: "/characters" })} />
        )}
      </SpriteProvider>

      <div className="absolute top-1.5 left-1/2 -translate-x-1/2 text-[8px] font-mono text-muted-foreground tracking-widest pointer-events-none z-50">
        L2SLAVE · pkts {packetCount}
      </div>
    </div>
  );
}
