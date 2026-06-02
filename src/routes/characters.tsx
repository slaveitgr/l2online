import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  getGameConnection,
  setGameConnection,
  type GameCharacter,
  type GameEvent,
} from "@/lib/l2-protocol/game-client";

export const Route = createFileRoute("/characters")({
  head: () => ({
    meta: [
      { title: "Character Select — Lineage II Web" },
      { name: "description", content: "Choose your hero and enter the world." },
    ],
  }),
  component: Characters,
});

type Char = GameCharacter;

function Characters() {
  const navigate = useNavigate();
  const [chars, setChars] = useState<Char[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [entering, setEntering] = useState(false);
  const [enterError, setEnterError] = useState<string | null>(null);
  const inWorldRef = useRef(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("l2_characters");
      const parsed: Char[] = raw ? JSON.parse(raw) : [];
      setChars(parsed);
      setSelected(parsed[0]?.id ?? null);
    } catch { /* ignore */ }
    try {
      const rawLog = sessionStorage.getItem("l2_gslog");
      setLog(rawLog ? JSON.parse(rawLog) : []);
    } catch { /* ignore */ }
  }, []);

  function appendLog(line: string) {
    setLog((l) => {
      const next = [...l.slice(-299), line];
      try { sessionStorage.setItem("l2_gslog", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  function enterWorld() {
    const conn = getGameConnection();
    if (!conn || !conn.connected) {
      setGameConnection(null);
      try { sessionStorage.removeItem("l2_characters"); } catch { /* ignore */ }
      setEnterError("Game session lost — please sign in again.");
      setTimeout(() => navigate({ to: "/" }), 800);
      return;
    }
    const idx = chars.findIndex((c) => c.id === selected);
    const slot = idx < 0 ? 0 : idx;
    inWorldRef.current = false;
    setEnterError(null);
    setEntering(true);

    conn.setEventHandler((ev: GameEvent) => {
      console.log("[GS]", ev);
      if (ev.type === "status") {
        appendLog(ev.message);
      } else if (ev.type === "char-selected") {
        appendLog(`[GS] char-selected ${ev.name} (#${ev.objectId})`);
      } else if (ev.type === "in-world") {
        inWorldRef.current = true;
        appendLog(ev.message);
        navigate({ to: "/world" });
      } else if (ev.type === "error") {
        setEnterError(ev.error);
        setEntering(false);
      } else if (ev.type === "closed") {
        if (!inWorldRef.current) {
          setEnterError("Game server closed the connection during enter-world.");
          setEntering(false);
          setGameConnection(null);
        }
      }
    });

    conn.selectCharacter(slot);
  }

  const logPanel = log.length > 0 ? (
    <details className="text-[10px] font-mono text-muted-foreground panel rounded p-3 max-w-3xl mx-auto w-full" open={entering}>
      <summary className="cursor-pointer hover:text-gold">Protocol log ({log.length})</summary>
      <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words leading-relaxed">
        {log.join("\n")}
      </pre>
    </details>
  ) : null;

  if (chars.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="font-display text-gold text-xl tracking-widest">NO CHARACTERS LOADED</p>
        <p className="text-sm text-muted-foreground max-w-md">
          Sign in and select a game server from the launcher to load your roster.
        </p>
        <Link to="/" className="text-xs px-4 py-2 border border-gold/40 rounded text-gold hover:bg-gold/10 transition">← Back to launcher</Link>
        {logPanel}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/60 px-6 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-8 h-8 rounded-sm bg-gradient-to-br from-primary to-blood flex items-center justify-center font-display text-primary-foreground font-bold">L</div>
          <div>
            <h1 className="font-display text-gold text-lg leading-none tracking-widest group-hover:brightness-125 transition">LINEAGE II</h1>
            <p className="text-[10px] text-muted-foreground tracking-[0.3em] uppercase">Character Select</p>
          </div>
        </Link>
        <Link to="/" className="text-xs text-muted-foreground hover:text-gold transition">← Back</Link>
      </header>

      <main className="flex-1 grid lg:grid-cols-[420px_1fr]">
        {/* Roster */}
        <aside className="border-r border-border/60 p-6 space-y-3 overflow-y-auto">
          <p className="text-gold/80 font-mono text-xs tracking-[0.4em] uppercase mb-4">Heroes — {chars.length} / 7</p>
          {chars.map((c) => {
            const active = c.id === selected;
            return (
              <button
                key={c.id}
                onClick={() => setSelected(c.id)}
                className={`w-full text-left panel rounded p-4 flex items-center gap-4 transition-all ${
                  active ? "ring-1 ring-gold border-gold" : "opacity-70 hover:opacity-100"
                }`}
              >
                <div
                  className="w-14 h-14 rounded shrink-0 flex items-center justify-center font-display text-2xl text-primary-foreground"
                  style={{ background: `linear-gradient(135deg, ${c.color}, oklch(0.2 0.03 30))` }}
                >
                  {c.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-display text-lg text-foreground truncate">{c.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{c.race} · {c.klass}</p>
                  <p className="text-xs text-gold mt-1">Lv. {c.level}</p>
                </div>
              </button>
            );
          })}
          <button className="w-full border border-dashed border-border rounded p-4 text-sm text-muted-foreground hover:text-gold hover:border-gold-muted transition">
            + Create new
          </button>
        </aside>

        {/* Preview */}
        <section className="relative flex flex-col items-center justify-center p-12">
          <div className="absolute inset-0 bg-gradient-to-br from-blood/20 via-background to-background" />
          <div className="relative z-10 text-center">
            {(() => {
              const c = chars.find((x) => x.id === selected) ?? chars[0];
              return (
                <>
                  <div
                    className="w-48 h-48 mx-auto rounded-full border-4 border-gold-muted/40 flex items-center justify-center font-display text-7xl text-primary-foreground shadow-2xl"
                    style={{ background: `radial-gradient(circle, ${c.color}, oklch(0.15 0.02 30))` }}
                  >
                    {c.name[0]}
                  </div>
                  <h2 className="font-display text-5xl text-foreground mt-8 tracking-wider">{c.name}</h2>
                  <p className="text-gold mt-2 tracking-widest font-mono">{c.race.toUpperCase()} · {c.klass.toUpperCase()}</p>
                  <p className="text-muted-foreground mt-1">Level {c.level}</p>
                  <div className="gold-divider mt-8 max-w-xs mx-auto" />
                  <button
                    onClick={enterWorld}
                    disabled={entering}
                    className="mt-8 bg-gradient-to-b from-primary to-gold-muted text-primary-foreground font-display tracking-[0.3em] px-12 py-4 rounded border border-gold/40 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xl"
                  >
                    {entering ? "ENTERING…" : "ENTER WORLD"}
                  </button>
                  {enterError && (
                    <div className="mt-4 text-xs text-blood bg-blood/10 border border-blood/40 rounded p-2 font-mono max-w-md mx-auto">
                      {enterError}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </section>
      </main>
      {logPanel && <div className="border-t border-border/60 p-4">{logPanel}</div>}
    </div>
  );
}
