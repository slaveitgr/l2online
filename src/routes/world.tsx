import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { WorldViewport } from "@/components/WorldViewport";
import { L2HudAuthentic } from "@/components/hud/L2HudAuthentic";
import { MobileGameHud } from "@/components/mobile/MobileGameHud";
import { RotateDeviceOverlay } from "@/components/mobile/RotateDeviceOverlay";
import { useIsMobileGame } from "@/hooks/useIsMobileGame";
import { lockLandscape } from "@/lib/mobile/orientation";
import { getGameConnection, setGameConnection, type GameEvent } from "@/lib/l2-protocol/game-client";

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

function WorldPage() {
  const navigate = useNavigate();
  const [, setChar] = useState<ActiveChar>({ name: "Hero", level: 1 });
  const [packetCount, setPacketCount] = useState(0);
  const { isMobile, isLandscape } = useIsMobileGame();

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
      }
    });
  }, [navigate]);

  useEffect(() => {
    if (isMobile) void lockLandscape();
  }, [isMobile]);

  return (
    <div className="fixed inset-0 bg-background overflow-hidden">
      <WorldViewport />

      {isMobile ? (
        isLandscape ? (
          <MobileGameHud
            onAttack={() => { /* TODO: send attack packet */ }}
            onInteract={() => { /* TODO: send action packet */ }}
            onMove={(_dx, _dy) => { /* TODO: send move packet */ }}
            onSay={(_text) => { /* TODO: send say packet */ }}
          />
        ) : (
          <RotateDeviceOverlay />
        )
      ) : (
        <L2HudAuthentic />
      )}

      <div className="absolute top-1.5 left-1/2 -translate-x-1/2 text-[8px] font-mono text-muted-foreground tracking-widest pointer-events-none z-50">
        L2SLAVE · pkts {packetCount}
      </div>
    </div>
  );
}
