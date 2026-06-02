import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { WorldViewport } from "@/components/WorldViewport";
import { getGameConnection, setGameConnection, type GameEvent } from "@/lib/l2-protocol/game-client";

export const Route = createFileRoute("/world")({
  head: () => ({
    meta: [
      { title: "World — Lineage II Web" },
      { name: "description", content: "Real-time WebGL rendering of Lineage 2 maps in the browser." },
    ],
  }),
  component: WorldPage,
});

function WorldPage() {
  const navigate = useNavigate();
  const [packetCount, setPacketCount] = useState(0);
  const [lastOpcode, setLastOpcode] = useState<number | null>(null);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    const conn = getGameConnection();
    if (!conn || !conn.connected) {
      navigate({ to: "/" });
      return;
    }
    conn.setEventHandler((ev: GameEvent) => {
      console.log("[GS world]", ev);
      if (ev.type === "world-packet") {
        setPacketCount((n) => n + 1);
        setLastOpcode(ev.opcode);
        setRecent((r) => [
          ...r.slice(-19),
          `0x${ev.opcode.toString(16).padStart(2, "0")} (${ev.length}B)`,
        ]);
      } else if (ev.type === "closed") {
        setGameConnection(null);
      }
    });
    // No disconnect on unmount — only the Exit button tears down the socket.
  }, [navigate]);

  function exitWorld() {
    const conn = getGameConnection();
    try { conn?.disconnect(); } catch { /* ignore */ }
    setGameConnection(null);
    navigate({ to: "/characters" });
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-background">
      <header className="border-b border-border/60 px-4 py-2 flex items-center justify-between bg-background/80 backdrop-blur z-10">
        <Link to="/characters" className="flex items-center gap-3 group">
          <div className="w-7 h-7 rounded-sm bg-gradient-to-br from-primary to-blood flex items-center justify-center font-display text-primary-foreground font-bold text-sm">L</div>
          <div className="font-display text-gold text-sm tracking-widest group-hover:brightness-125 transition">LINEAGE II — WORLD</div>
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">
            pkts {packetCount}{lastOpcode != null ? ` · last 0x${lastOpcode.toString(16).padStart(2, "0")}` : ""}
          </span>
          <button onClick={exitWorld} className="text-xs border border-border rounded px-3 py-1 hover:bg-accent hover:border-gold-muted transition">
            Exit
          </button>
        </div>
      </header>
      <div className="flex-1 relative">
        <WorldViewport />
        {recent.length > 0 && (
          <div className="absolute bottom-3 left-3 panel rounded p-2 max-w-xs text-[10px] font-mono text-muted-foreground pointer-events-none">
            <div className="text-gold/80 mb-1 tracking-widest">WORLD PACKETS</div>
            <div className="space-y-0.5 max-h-40 overflow-hidden">
              {recent.slice(-10).map((s, i) => <div key={i}>{s}</div>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
