import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
      { title: "Select Character — Lineage II Web" },
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

  function play() {
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
        appendLog(`char-selected ${ev.name} (#${ev.objectId})`);
      } else if (ev.type === "in-world") {
        inWorldRef.current = true;
        appendLog(ev.message);
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

    conn.selectCharacter(slot);
  }

  function exitToLauncher() {
    const conn = getGameConnection();
    try { conn?.disconnect(); } catch { /* ignore */ }
    setGameConnection(null);
    navigate({ to: "/" });
  }

  const sel = chars.find((c) => c.id === selected) ?? chars[0] ?? null;
  const slotCount = 7;
  const slots = Array.from({ length: slotCount }, (_, i) => chars[i] ?? null);

  return (
    <div className="fixed inset-0 overflow-hidden l2-bg-charsel">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/70 pointer-events-none" />

      {/* Top-left label */}
      <div className="absolute top-3 left-4 text-sm text-foreground/85 font-display tracking-[0.25em]">
        Select Character
      </div>

      {/* Right column slot list */}
      <div className="absolute top-16 right-3 w-56 space-y-1.5">
        {slots.map((c, i) => {
          if (!c) {
            return (
              <button
                key={`empty-${i}`}
                className="w-full h-12 l2-frame rounded flex items-center justify-center text-2xl text-muted-foreground/40 hover:text-gold transition"
              >
                +
              </button>
            );
          }
          const active = c.id === selected;
          return (
            <button
              key={c.id}
              onClick={() => setSelected(c.id)}
              className={`w-full l2-frame rounded p-2 flex items-center gap-2 text-left transition ${
                active ? "ring-1 ring-gold" : "opacity-70 hover:opacity-100"
              }`}
              style={active ? { borderColor: "#c9a84c" } : undefined}
            >
              <div
                className="w-9 h-9 rounded-sm shrink-0 flex items-center justify-center font-display text-base text-primary-foreground border border-border/60"
                style={{ background: `linear-gradient(135deg, ${c.color}, oklch(0.2 0.03 30))` }}
              >
                {c.name[0]}
              </div>
              <div className="flex-1 min-w-0 leading-tight">
                <p className="text-[10px] text-foreground truncate">Lv.{c.level}</p>
                <p className="text-[9px] text-muted-foreground truncate">{c.klass}</p>
                <p className="text-[10px] text-gold truncate">{c.name}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Center character silhouette (placeholder) */}
      {sel && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[55%] pointer-events-none">
          <div
            className="w-56 h-72 rounded-full blur-2xl opacity-40"
            style={{ background: `radial-gradient(circle, ${sel.color}, transparent 70%)` }}
          />
        </div>
      )}

      {/* Center-bottom stats panel */}
      {sel && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-[320px]">
          <div className="text-center mb-1">
            <div className="text-gold text-sm font-display tracking-widest">{sel.name}</div>
            <div className="text-[10px] text-muted-foreground">Lv.{sel.level} {sel.klass}</div>
          </div>
          <div className="l2-frame rounded px-3 py-2 space-y-1 text-[9px] font-mono">
            <StatRow label="HP" value="—" pct={1} color="oklch(0.55 0.22 25)" />
            <StatRow label="MP" value="—" pct={1} color="oklch(0.55 0.18 250)" />
            <StatRow label="VP" value="" pct={0} color="oklch(0.6 0.18 30)" />
            <StatRow label="XP" value={`Lv.${sel.level}`} pct={0.83} color="oklch(0.55 0.04 70)" />
            <div className="flex items-center justify-between pt-0.5">
              <span className="text-muted-foreground w-7">SP</span>
              <span className="flex-1 text-foreground/80 px-2">{sel.race}</span>
              <span className="text-muted-foreground">Rep. <span className="text-foreground/80">0</span></span>
            </div>
          </div>

          <div className="flex justify-center mt-3">
            <button onClick={play} disabled={entering} className="l2-button" style={{ minWidth: "8rem" }}>
              {entering ? "…" : "Play"}
            </button>
          </div>
          {enterError && (
            <div className="mt-2 text-[10px] text-blood bg-blood/10 border border-blood/40 rounded px-2 py-1 font-mono text-center">
              {enterError}
            </div>
          )}
        </div>
      )}

      {/* Bottom-left actions */}
      <div className="absolute bottom-12 left-3 flex flex-col items-start gap-0.5">
        <button className="l2-corner-link">Credits</button>
        <button onClick={exitToLauncher} className="l2-corner-link">Exit</button>
      </div>

      {/* Bottom-right actions */}
      <div className="absolute bottom-12 right-3 flex items-center gap-3">
        <button className="l2-corner-link">Create</button>
        <button className="l2-corner-link">Delete</button>
      </div>

      {/* Protocol log (only while entering or on error) */}
      {(entering || enterError || log.length > 0) && (
        <details className="absolute bottom-24 left-3 max-w-sm l2-frame rounded px-3 py-2 text-[10px] font-mono text-muted-foreground" open={entering}>
          <summary className="cursor-pointer hover:text-gold tracking-widest">PROTOCOL LOG ({log.length})</summary>
          <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words leading-relaxed">
            {log.join("\n")}
          </pre>
        </details>
      )}

      {/* Footer */}
      <div className="l2-footer">
        <span className="font-display tracking-[0.3em] text-gold/80">L2</span>
        <span className="sep">|</span>
        <span className="font-display tracking-[0.4em] text-foreground/80">L2SLAVE</span>
        <span className="sep">|</span>
        <a href="https://l2.slave.gr" target="_blank" rel="noreferrer" className="hover:text-gold transition pointer-events-auto">l2.slave.gr</a>
      </div>

    </div>
  );
}

function StatRow({ label, value, pct, color }: { label: string; value: string; pct: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground w-7">{label}</span>
      <div className="l2-bar flex-1" style={{ ["--bar-color" as string]: color } as React.CSSProperties}>
        <span style={{ width: `${Math.max(0, Math.min(1, pct)) * 100}%` }} />
      </div>
      <span className="text-foreground/80 w-20 text-right">{value}</span>
    </div>
  );
}
