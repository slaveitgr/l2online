import { createFileRoute, Link } from "@tanstack/react-router";
import { WorldViewport } from "@/components/WorldViewport";

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
  return (
    <div className="fixed inset-0 flex flex-col bg-background">
      <header className="border-b border-border/60 px-4 py-2 flex items-center justify-between bg-background/80 backdrop-blur z-10">
        <Link to="/characters" className="flex items-center gap-3 group">
          <div className="w-7 h-7 rounded-sm bg-gradient-to-br from-primary to-blood flex items-center justify-center font-display text-primary-foreground font-bold text-sm">L</div>
          <div className="font-display text-gold text-sm tracking-widest group-hover:brightness-125 transition">LINEAGE II — WORLD</div>
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">Phase 1 viewport</span>
          <Link to="/characters" className="text-xs border border-border rounded px-3 py-1 hover:bg-accent hover:border-gold-muted transition">Exit</Link>
        </div>
      </header>
      <div className="flex-1 relative">
        <WorldViewport />
      </div>
    </div>
  );
}
