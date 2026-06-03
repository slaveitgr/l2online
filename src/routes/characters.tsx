import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  getGameConnection,
  setGameConnection,
  type GameCharacter,
  type GameEvent,
} from "@/lib/l2-protocol/game-client";
import { SpriteProvider } from "@/components/hud/L2Sprite";
import { L2CharSelectScreen, type CharSlot } from "@/components/hud/L2CharSelectScreen";

export const Route = createFileRoute("/characters")({
  head: () => ({
    meta: [
      { title: "Select Character — Lineage II Web" },
      { name: "description", content: "Choose your hero and enter the world." },
    ],
  }),
  component: Characters,
});

function Characters() {
  const navigate = useNavigate();
  const [chars, setChars] = useState<GameCharacter[]>([]);
  const [selected, setSelected] = useState(0);
  const [entering, setEntering] = useState(false);
  const [enterError, setEnterError] = useState<string | null>(null);
  const inWorldRef = useRef(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("l2_characters");
      const parsed: GameCharacter[] = raw ? JSON.parse(raw) : [];
      setChars(parsed);
    } catch { /* ignore */ }
  }, []);

  function play(i: number) {
    const conn = getGameConnection();
    if (!conn || !conn.connected) {
      setGameConnection(null);
      try { sessionStorage.removeItem("l2_characters"); } catch { /* ignore */ }
      setEnterError("Game session lost — please sign in again.");
      setTimeout(() => navigate({ to: "/" }), 800);
      return;
    }
    inWorldRef.current = false;
    setEnterError(null);
    setEntering(true);

    conn.setEventHandler((ev: GameEvent) => {
      if (ev.type === "in-world") {
        inWorldRef.current = true;
        const cur = chars[i];
        if (cur) {
          try {
            sessionStorage.setItem("l2.activeChar", JSON.stringify({ name: cur.name, level: cur.level, klass: cur.klass, race: cur.race }));
          } catch { /* ignore */ }
        }
        navigate({ to: "/world" });
      } else if (ev.type === "error") {
        setEnterError(ev.error);
        setEntering(false);
      } else if (ev.type === "closed") {
        if (!inWorldRef.current) {
          setEnterError("Game server closed the connection.");
          setEntering(false);
          setGameConnection(null);
        }
      }
    });

    conn.selectCharacter(i);
  }

  function exitToLauncher() {
    const conn = getGameConnection();
    try { conn?.disconnect(); } catch { /* ignore */ }
    setGameConnection(null);
    navigate({ to: "/" });
  }

  const slots: CharSlot[] = chars.map((c) => ({
    name: c.name,
    level: c.level,
    className: c.klass,
    className2: c.race,
  }));

  return (
    <SpriteProvider>
      <L2CharSelectScreen
        characters={slots}
        selected={selected}
        onSelect={setSelected}
        onStart={(i) => !entering && play(i)}
        onCreate={() => navigate({ to: "/character-create" })}
        onDelete={() => { /* not implemented yet */ }}
        onBack={exitToLauncher}
      />
      {enterError && (
        <div style={{ position: "fixed", left: "50%", bottom: 80, transform: "translateX(-50%)", fontSize: 11, color: "#e06a6a", background: "rgba(0,0,0,0.7)", padding: "6px 12px", border: "1px solid #5a2a2a", zIndex: 100 }}>
          {enterError}
        </div>
      )}
      {entering && (
        <div style={{ position: "fixed", left: "50%", bottom: 80, transform: "translateX(-50%)", fontSize: 11, color: "#e6c87a", background: "rgba(0,0,0,0.7)", padding: "6px 12px", zIndex: 100 }}>
          Entering world…
        </div>
      )}
    </SpriteProvider>
  );
}
