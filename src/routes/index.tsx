import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { L2LoginClient, type GameServer, type LoginEvent } from "@/lib/l2-protocol/login-client";
import { L2GameClient, setGameConnection, type GameEvent } from "@/lib/l2-protocol/game-client";
import loginVideo from "@/assets/login_web.mp4.asset.json";

const GAME_PROTOCOL = 502;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lineage II — Web Client" },
      { name: "description", content: "Browser-based Lineage 2 client." },
    ],
  }),
  component: Launcher,
});

type Phase = "login" | "server-select";

function Launcher() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [phase, setPhase] = useState<Phase>("login");
  const [servers, setServers] = useState<GameServer[]>([]);
  const [selectedServer, setSelectedServer] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusLog, setStatusLog] = useState<string[]>([]);

  useEffect(() => {
    // Clear any stale log when landing on launcher
    try {
      const raw = sessionStorage.getItem("l2_gslog");
      if (raw) setStatusLog(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  function pushStatus(msg: string) {
    setStatusLog((l) => {
      const next = [...l.slice(-199), msg];
      try { sessionStorage.setItem("l2_gslog", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  const loginRef = useRef<L2LoginClient | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setServers([]);
    setStatusLog([]);
    try { sessionStorage.removeItem("l2_gslog"); } catch { /* ignore */ }
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
          console.log("[LS]", ev);
          if (ev.type === "status") pushStatus(ev.message);
          else if (ev.type === "init") pushStatus(`Init: protocol=${ev.protocolRevision}`);
          else if (ev.type === "gg-ok") pushStatus("GameGuard OK");
          else if (ev.type === "login-ok") pushStatus("LoginOk — requesting server list");
          else if (ev.type === "raw") {
            pushStatus(`← opcode 0x${ev.opcode.toString(16).padStart(2, "0")} (${ev.bytes.length}B)`);
          }
        },
      });
      loginRef.current = client;
      const result = await client.start();
      if (result.type === "server-list") {
        setServers(result.servers);
        setSelectedServer(result.servers[0]?.id ?? null);
        setPhase("server-select");
      } else if (result.type === "login-fail") {
        setError(`Login failed: ${result.reason}`);
      } else if (result.type === "error") {
        setError(result.error);
      } else if (result.type === "closed") {
        setError("Connection closed before completion.");
      }
    } finally {
      setBusy(false);
    }
  }

  function cancelServerSelect() {
    try { loginRef.current?.close(); } catch { /* ignore */ }
    loginRef.current = null;
    setServers([]);
    setSelectedServer(null);
    setPhase("login");
  }

  async function onEnterWorld() {
    if (selectedServer == null) return;
    const login = loginRef.current;
    const server = servers.find((s) => s.id === selectedServer);
    if (!login || !server) { setError("Login session lost — please re-authenticate."); setPhase("login"); return; }
    setBusy(true);
    setError(null);
    try {
      pushStatus(`Requesting PlayOk for server #${server.id}…`);
      const playEv = await login.selectServer(server.id);
      if (playEv.type !== "play-ok") {
        setError(playEv.type === "login-fail" ? `PlayOk failed: ${playEv.reason}` : "PlayOk failed");
        return;
      }
      const [p1, p2] = playEv.playKey;
      const [k1, k2] = login.loginSessionKey;
      login.close();

      pushStatus(`Connecting to game server ${server.ip}:${server.port}…`);
      const gs = new L2GameClient({
        host: server.ip,
        port: server.port,
        username,
        protocolRevision: GAME_PROTOCOL,
        loginKey1: k1,
        loginKey2: k2,
        playKey1: p1,
        playKey2: p2,
        keepAlive: true,
        onEvent: (ev: GameEvent) => {
          console.log("[GS]", ev);
          if (ev.type === "status") pushStatus(ev.message);
        },
      });
      const gr = await gs.start();
      if (gr.type === "characters") {
        setGameConnection(gs);
        sessionStorage.setItem("l2_characters", JSON.stringify(gr.chars));
        sessionStorage.setItem("l2_session", JSON.stringify({ username, server }));
        navigate({ to: "/characters" });
      } else if (gr.type === "error") {
        setGameConnection(null);
        setError(gr.error);
      } else {
        setGameConnection(null);
        setError("Game server closed connection before character list arrived.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 overflow-hidden l2-bg-login">
      {/* Background video */}
      <video
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        src={loginVideo.url}
      />
      <div className="absolute inset-0 bg-black/50 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/70 pointer-events-none" />

      {/* Center modal — Login or Server select */}
      <div className="absolute inset-0 flex items-center justify-center">
        {phase === "login" ? (
          <form onSubmit={onSubmit} className="l2-frame rounded px-4 py-3 w-[300px] space-y-2" suppressHydrationWarning>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Login"
              autoComplete="username"
              className="l2-input"
              autoFocus
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              className="l2-input"
            />
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={busy || !username || !password}
                className="l2-button flex-1"
              >
                {busy ? "…" : "Log In"}
              </button>
              <button
                type="button"
                onClick={() => { setUsername(""); setPassword(""); setError(null); }}
                className="l2-button flex-1"
              >
                Exit
              </button>
            </div>
            {error && (
              <div className="text-[10px] text-blood bg-blood/10 border border-blood/40 rounded px-2 py-1 font-mono text-center">
                {error}
              </div>
            )}
          </form>
        ) : (
          <div className="l2-frame rounded px-4 py-3 w-[420px] space-y-2">
            <div className="flex items-center gap-2">
              <span className="l2-button" style={{ minWidth: "5rem", pointerEvents: "none" }}>Server</span>
              <select
                value={selectedServer ?? ""}
                onChange={(e) => setSelectedServer(Number(e.target.value))}
                className="l2-input flex-1 appearance-none"
                style={{ textAlignLast: "center" }}
              >
                {servers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {`#${s.id}  ${s.ip}:${s.port}  ·  ${s.currentPlayers}/${s.maxPlayers}`}
                  </option>
                ))}
              </select>
              <span className="text-[10px] text-gold tracking-widest px-2">L2SLAVE</span>
              <span className="text-[10px] text-muted-foreground tracking-widest">Light</span>
            </div>
            <div className="flex justify-center gap-2 pt-1">
              <button onClick={onEnterWorld} disabled={busy || selectedServer == null} className="l2-button">
                {busy ? "…" : "OK"}
              </button>
              <button onClick={cancelServerSelect} disabled={busy} className="l2-button">Cancel</button>
            </div>
            {error && (
              <div className="text-[10px] text-blood bg-blood/10 border border-blood/40 rounded px-2 py-1 font-mono text-center">
                {error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom-right corner links */}
      <div className="absolute bottom-12 right-6 flex flex-col items-end gap-1 text-right pointer-events-auto">
        <a href="https://l2.slave.gr/register" target="_blank" rel="noreferrer" className="l2-corner-link">New Account <span className="opacity-60">↗</span></a>
        <a href="http://l2.slave.gr/forgot-password" target="_blank" rel="noreferrer" className="l2-corner-link">Lost Account <span className="opacity-60">↗</span></a>
        <a href="https://l2.slave.gr" target="_blank" rel="noreferrer" className="l2-corner-link">Links <span className="opacity-60">↗</span></a>
        <Link to="/cdn-cache" className="l2-corner-link">Settings <span className="opacity-60">↗</span></Link>
      </div>


      {/* Bottom-left protocol log */}
      {statusLog.length > 0 && (
        <details className="absolute bottom-12 left-3 max-w-md l2-frame rounded px-3 py-2 text-[10px] font-mono text-muted-foreground">
          <summary className="cursor-pointer hover:text-gold tracking-widest">PROTOCOL LOG ({statusLog.length})</summary>
          <pre className="mt-2 max-h-56 max-w-md overflow-auto whitespace-pre-wrap break-words leading-relaxed">
            {statusLog.join("\n")}
          </pre>
        </details>
      )}

      {/* Footer bar */}
      <div className="l2-footer">
        <span className="font-display tracking-[0.3em] text-gold/80">L2</span>
        <span className="sep">|</span>
        <span className="font-display tracking-[0.4em] text-foreground/80">L2SLAVE</span>
        <span className="sep">|</span>
        <a href="https://l2.slave.gr" target="_blank" rel="noreferrer" className="hover:text-gold transition pointer-events-auto">l2.slave.gr</a>
        <span className="sep">·</span>
        <span>Unofficial web client</span>
      </div>

    </div>
  );
}
