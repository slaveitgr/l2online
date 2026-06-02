import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { L2LoginClient, type GameServer, type LoginEvent } from "@/lib/l2-protocol/login-client";
import { L2GameClient, type GameCharacter, type GameEvent } from "@/lib/l2-protocol/game-client";
import { getMountStatus, pickFolder, unmount, type MountStatus } from "@/lib/local-mount";
import { getCacheStats, formatBytes, type CacheStats } from "@/lib/l2-assets";
import { loadL2Ini, summarize, type L2Summary } from "@/lib/l2-config";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lineage II — Web Client" },
      { name: "description", content: "Browser-based Lineage 2 client with real login against l2server.slave.gr." },
    ],
  }),
  component: Launcher,
});

function Launcher() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [iniSummary, setIniSummary] = useState<L2Summary | null>(null);
  const [mount, setMount] = useState<MountStatus | null>(null);
  const [cache, setCache] = useState<CacheStats | null>(null);
  const [servers, setServers] = useState<GameServer[]>([]);
  const [selectedServer, setSelectedServer] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusLog, setStatusLog] = useState<string[]>([]);

  useEffect(() => {
    loadL2Ini().then((ini) => setIniSummary(summarize(ini))).catch(() => {});
    refreshAssets();
  }, []);

  async function refreshAssets() {
    try {
      const [m, c] = await Promise.all([getMountStatus(), getCacheStats()]);
      setMount(m);
      setCache(c);
    } catch {/* ignore */}
  }

  async function onMountFolder() {
    try {
      await pickFolder();
      await refreshAssets();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function onUnmount() {
    await unmount();
    await refreshAssets();
  }

  function pushStatus(msg: string) {
    setStatusLog((l) => [...l.slice(-19), msg]);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setServers([]);
    setStatusLog([]);
    setBusy(true);
    const host = "l2server.slave.gr";
    const port = 2106;
    try {
      const client = new L2LoginClient({
        host,
        port,
        username,
        password,
        onEvent: (ev: LoginEvent) => {
          if (ev.type === "status") pushStatus(ev.message);
          else if (ev.type === "init") pushStatus(`Init: protocol=${ev.protocolRevision}`);
          else if (ev.type === "gg-ok") pushStatus("GameGuard OK");
          else if (ev.type === "login-ok") pushStatus("LoginOk — requesting server list");
          else if (ev.type === "raw") {
            pushStatus(`← opcode 0x${ev.opcode.toString(16).padStart(2, "0")} (${ev.bytes.length}B)`);
          }
        },
      });
      const result = await client.start();
      if (result.type === "server-list") {
        setServers(result.servers);
        setSelectedServer(result.servers[0]?.id ?? null);
        sessionStorage.setItem("l2_session", JSON.stringify({ username, servers: result.servers }));
      } else if (result.type === "login-fail") {
        setError(`Login failed: ${result.reason}`);
      } else if (result.type === "error") {
        setError(result.error);
      } else if (result.type === "closed") {
        setError("Connection closed before completion. Server may not support this protocol revision.");
      }
    } finally {
      setBusy(false);
    }
  }

  function onEnterWorld() {
    if (selectedServer == null) return;
    navigate({ to: "/characters" });
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/60 px-6 py-3 flex items-center justify-between backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-sm bg-gradient-to-br from-primary to-blood flex items-center justify-center font-display text-primary-foreground font-bold">L</div>
          <div>
            <h1 className="font-display text-gold text-lg leading-none tracking-widest">LINEAGE II</h1>
            <p className="text-[10px] text-muted-foreground tracking-[0.3em] uppercase">Web Client · slave.gr</p>
          </div>
        </div>
        <div className="text-xs text-muted-foreground font-mono">v0.2.0-alpha</div>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 py-6 gap-6">
        {/* ASSET STATUS — shown BEFORE login */}
        <section className="panel w-full max-w-3xl p-5 rounded space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-gold tracking-widest text-sm">CLIENT ASSETS</h2>
            <Link to="/cdn-cache" className="text-xs text-muted-foreground hover:text-gold">Manage cache →</Link>
          </div>
          <div className="gold-divider" />

          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Local folder mount</p>
              {mount?.supported === false ? (
                <p className="text-xs text-muted-foreground">Not supported (use Chrome/Edge)</p>
              ) : mount?.mounted ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-foreground truncate">📁 {mount.name}</span>
                  <button onClick={onUnmount} className="text-xs text-muted-foreground hover:text-blood">Unmount</button>
                </div>
              ) : (
                <button
                  onClick={onMountFolder}
                  className="text-xs px-3 py-1.5 rounded border border-gold/40 text-gold hover:bg-gold/10 transition"
                >
                  Mount local L2 folder
                </button>
              )}
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">IndexedDB cache</p>
              <p className="text-foreground">
                {cache ? `${cache.cachedFiles} / ${cache.totalFiles} files · ${formatBytes(cache.cachedBytes)}` : "—"}
              </p>
              {cache && cache.cachedFiles > 0 && (
                <p className="text-[10px] text-muted-foreground mt-0.5">Falls back to CDN proxy if missing</p>
              )}
            </div>
          </div>

          {iniSummary && (
            <div className="pt-3 border-t border-border/40 text-[11px] font-mono text-muted-foreground space-y-0.5">
              <div>auth: <span className="text-gold">{iniSummary.authServer}</span>:2106</div>
              <div>map: {iniSummary.startupMap} · paths: {iniSummary.searchPaths.length}</div>
            </div>
          )}
        </section>

        {/* LOGIN */}
        <section className="panel w-full max-w-md p-6 rounded">
          <div className="text-center mb-5">
            <h3 className="font-display text-xl text-gold tracking-widest">SIGN IN</h3>
            <div className="gold-divider mt-2" />
            <p className="text-[10px] text-muted-foreground mt-2 font-mono">l2server.slave.gr:2106</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4" suppressHydrationWarning>
            <div>
              <label className="block text-xs uppercase tracking-widest text-muted-foreground mb-1.5 font-display">Account</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="account"
                autoComplete="username"
                className="w-full bg-input border border-border rounded px-3 py-2 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-gold focus:ring-1 focus:ring-ring"
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-widest text-muted-foreground mb-1.5 font-display">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full bg-input border border-border rounded px-3 py-2 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-gold focus:ring-1 focus:ring-ring"
              />
            </div>

            <button
              type="submit"
              disabled={busy || !username || !password}
              className="w-full bg-gradient-to-b from-primary to-gold-muted text-primary-foreground font-display tracking-[0.3em] py-2.5 rounded border border-gold/40 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
            >
              {busy ? "AUTHENTICATING…" : "ENTER"}
            </button>

            {error && (
              <div className="text-xs text-blood bg-blood/10 border border-blood/40 rounded p-2 font-mono">
                {error}
              </div>
            )}
          </form>

          {servers.length > 0 && (
            <div className="mt-5 pt-5 border-t border-border/40 space-y-3">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-display">Server List</p>
              <div className="space-y-1">
                {servers.map((s) => (
                  <label
                    key={s.id}
                    className={`flex items-center justify-between text-sm px-3 py-2 rounded border cursor-pointer transition ${
                      selectedServer === s.id ? "border-gold bg-gold/10" : "border-border/60 hover:border-gold/40"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="server"
                        checked={selectedServer === s.id}
                        onChange={() => setSelectedServer(s.id)}
                        className="accent-gold"
                      />
                      <span className="font-mono">#{s.id}</span>
                      <span className="text-foreground">{s.ip}:{s.port}</span>
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {s.currentPlayers}/{s.maxPlayers} · status {s.status}
                    </span>
                  </label>
                ))}
              </div>
              <button
                onClick={onEnterWorld}
                disabled={selectedServer == null}
                className="w-full bg-gradient-to-b from-primary to-gold-muted text-primary-foreground font-display tracking-[0.3em] py-2 rounded border border-gold/40 hover:brightness-110 disabled:opacity-50 transition"
              >
                ENTER WORLD
              </button>
            </div>
          )}

          {statusLog.length > 0 && (
            <details className="mt-4 text-[10px] font-mono text-muted-foreground" open={busy}>
              <summary className="cursor-pointer hover:text-gold">Protocol log ({statusLog.length})</summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words leading-relaxed">
                {statusLog.join("\n")}
              </pre>
            </details>
          )}
        </section>
      </main>

      <footer className="px-6 py-3 text-[10px] text-muted-foreground/70 font-mono border-t border-border/40 flex justify-between">
        <span>Fan project · Not affiliated with NCSOFT</span>
        <span>WS↔TCP bridge via /api/l2-bridge</span>
      </footer>
    </div>
  );
}
