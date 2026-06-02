import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lineage II — Web Client" },
      { name: "description", content: "Sign in to the experimental browser-based Lineage 2 client." },
    ],
  }),
  component: Launcher,
});

const MOCK_SERVERS = [
  { id: "bartz", name: "Bartz", status: "Light", players: 1284, ping: 42 },
  { id: "sieghardt", name: "Sieghardt", status: "Normal", players: 2310, ping: 58 },
  { id: "gustin", name: "Gustin", status: "Heavy", players: 3782, ping: 71 },
  { id: "teon", name: "Teon", status: "Full", players: 4500, ping: 95 },
];

function Launcher() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState("bartz");

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sessionStorage.setItem("l2_session", JSON.stringify({ username: username || "Adventurer", server }));
    navigate({ to: "/cdn-cache" });
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top brand bar */}
      <header className="border-b border-border/60 px-6 py-3 flex items-center justify-between backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-sm bg-gradient-to-br from-primary to-blood flex items-center justify-center font-display text-primary-foreground font-bold">L</div>
          <div>
            <h1 className="font-display text-gold text-lg leading-none tracking-widest">LINEAGE II</h1>
            <p className="text-[10px] text-muted-foreground tracking-[0.3em] uppercase">Web Client · Interlude</p>
          </div>
        </div>
        <div className="text-xs text-muted-foreground font-mono">v0.1.0-alpha</div>
      </header>

      {/* Main */}
      <main className="flex-1 grid lg:grid-cols-[1fr_440px]">
        {/* Hero / art */}
        <section className="relative overflow-hidden hidden lg:flex items-end p-12">
          <div className="absolute inset-0 bg-gradient-to-br from-blood/30 via-background to-background" />
          <div className="absolute inset-0 opacity-30" style={{
            backgroundImage: "radial-gradient(circle at 30% 40%, oklch(0.5 0.18 30 / 0.4), transparent 50%), radial-gradient(circle at 70% 70%, oklch(0.4 0.12 60 / 0.3), transparent 60%)",
          }} />
          <div className="relative z-10 max-w-xl">
            <p className="text-gold/80 font-mono text-xs tracking-[0.4em] uppercase mb-4">Chapter I — Awakening</p>
            <h2 className="font-display text-5xl xl:text-6xl text-foreground leading-tight">
              The lands of <span className="text-gold">Aden</span> remember.
            </h2>
            <p className="mt-6 text-muted-foreground max-w-md leading-relaxed">
              An experimental WebGL recreation of the Interlude client. Bring your own assets,
              render the world in your browser, walk the roads of Talking Island once more.
            </p>
            <div className="gold-divider mt-8 max-w-xs" />
            <p className="mt-4 text-xs text-muted-foreground font-mono">
              Phase 1: shell + asset loader + 3D viewport
            </p>
          </div>
        </section>

        {/* Login panel */}
        <section className="flex items-center justify-center p-6 lg:border-l border-border/60">
          <div className="panel w-full max-w-sm p-8 rounded">
            <div className="text-center mb-8">
              <h3 className="font-display text-2xl text-gold tracking-widest">SIGN IN</h3>
              <div className="gold-divider mt-3" />
            </div>

            <form onSubmit={onSubmit} className="space-y-5">
              <div>
                <label className="block text-xs uppercase tracking-widest text-muted-foreground mb-2 font-display">Server</label>
                <select
                  value={server}
                  onChange={(e) => setServer(e.target.value)}
                  className="w-full bg-input border border-border rounded px-3 py-2 text-foreground focus:outline-none focus:border-gold focus:ring-1 focus:ring-ring"
                >
                  {MOCK_SERVERS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — {s.status} ({s.players.toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-widest text-muted-foreground mb-2 font-display">Account</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="adventurer"
                  className="w-full bg-input border border-border rounded px-3 py-2 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-gold focus:ring-1 focus:ring-ring"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-widest text-muted-foreground mb-2 font-display">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-input border border-border rounded px-3 py-2 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-gold focus:ring-1 focus:ring-ring"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-gradient-to-b from-primary to-gold-muted text-primary-foreground font-display tracking-[0.3em] py-3 rounded border border-gold/40 hover:brightness-110 transition-all shadow-lg"
              >
                ENTER
              </button>

              <p className="text-[10px] text-muted-foreground text-center font-mono">
                Stub login · No credentials are sent anywhere
              </p>
            </form>

            <div className="mt-8 pt-6 border-t border-border/40 flex justify-between text-xs text-muted-foreground">
              <button className="hover:text-gold transition-colors">Settings</button>
              <button className="hover:text-gold transition-colors">Create account</button>
            </div>
          </div>
        </section>
      </main>

      <footer className="px-6 py-3 text-[10px] text-muted-foreground/70 font-mono border-t border-border/40 flex justify-between">
        <span>Fan project · Not affiliated with NCSOFT</span>
        <span>Bring your own client assets · No files are distributed</span>
      </footer>
    </div>
  );
}
