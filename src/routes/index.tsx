import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { L2LoginClient, type GameServer, type LoginEvent } from "@/lib/l2-protocol/login-client";
import { L2GameClient, setGameConnection, type GameEvent } from "@/lib/l2-protocol/game-client";
import { SpriteProvider, L2Frame, L2Button } from "@/components/hud/L2Sprite";
import { L2LoginScreen } from "@/components/hud/L2LoginScreen";

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
  const [phase, setPhase] = useState<Phase>("login");
  const [servers, setServers] = useState<GameServer[]>([]);
  const [selectedServer, setSelectedServer] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusLog, setStatusLog] = useState<string[]>([]);

  useEffect(() => {
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

  async function doLogin(id: string, pw: string) {
    setUsername(id);
    setError(null);
    setServers([]);
    setStatusLog([]);
    try { sessionStorage.removeItem("l2_gslog"); } catch { /* ignore */ }
    setBusy(true);
    const host = "l2server.slave.gr";
    const port = 2106;
    try {
      const client = new L2LoginClient({
        host, port, username: id, password: pw,
        onEvent: (ev: LoginEvent) => {
          if (ev.type === "status") pushStatus(ev.message);
          else if (ev.type === "init") pushStatus(`Init: protocol=${ev.protocolRevision}`);
          else if (ev.type === "gg-ok") pushStatus("GameGuard OK");
          else if (ev.type === "login-ok") pushStatus("LoginOk — requesting server list");
          else if (ev.type === "raw") pushStatus(`← opcode 0x${ev.opcode.toString(16).padStart(2, "0")} (${ev.bytes.length}B)`);
        },
      });
      loginRef.current = client;
      const result = await client.start();
      if (result.type === "server-list") {
        setServers(result.servers);
        setSelectedServer(result.servers[0]?.id ?? null);
        setPhase("server-select");
      } else if (result.type === "login-fail") setError(`Login failed: ${result.reason}`);
      else if (result.type === "error") setError(result.error);
      else if (result.type === "closed") setError("Connection closed before completion.");
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
        host: server.ip, port: server.port, username,
        protocolRevision: GAME_PROTOCOL,
        loginKey1: k1, loginKey2: k2, playKey1: p1, playKey2: p2,
        keepAlive: true,
        onEvent: (ev: GameEvent) => { if (ev.type === "status") pushStatus(ev.message); },
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
    <SpriteProvider>
      {phase === "login" ? (
        <L2LoginScreen onLogin={doLogin} busy={busy} error={error} />
      ) : (
        <div style={{ position: "fixed", inset: 0, background: `#000 url(/hud/screens/LogonScreen.png) center/cover no-repeat`, fontFamily: "Tahoma, sans-serif" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, transparent 38%, rgba(0,0,0,0.45) 100%)" }} />
          <div style={{ position: "absolute", left: "50%", top: "58%", transform: "translate(-50%,-50%)", width: 600, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, color: "#f3e6c0" }}>
            <div style={{ width: "100%", display: "grid", gridTemplateColumns: "150px 1fr 120px 100px", border: "1px solid rgba(255,255,255,0.16)", background: "linear-gradient(180deg, rgba(17,14,12,0.86), rgba(8,8,8,0.8))", boxShadow: "0 8px 32px rgba(0,0,0,0.32)" }}>
              <div style={{ height: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRight: "1px solid rgba(255,255,255,0.12)", background: "linear-gradient(180deg, rgba(76,98,154,0.7), rgba(34,43,81,0.7))", color: "#fff1bd" }}>Server</div>
              <div style={{ height: 40, display: "flex", alignItems: "center", padding: "0 14px", borderRight: "1px solid rgba(255,255,255,0.08)" }}>{servers.find((s) => s.id === selectedServer)?.ip ?? "L2-Superion"}</div>
              <div style={{ height: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRight: "1px solid rgba(255,255,255,0.08)" }}>Lineage 2</div>
              <div style={{ height: 40, display: "flex", alignItems: "center", justifyContent: "center" }}>Light</div>
            </div>
            <select
              value={selectedServer ?? ""}
              onChange={(e) => setSelectedServer(Number(e.target.value))}
              style={{ width: 600, height: 30, background: "linear-gradient(180deg, rgba(18,16,14,0.94), rgba(10,10,10,0.94))", border: "1px solid rgba(214,171,98,0.65)", color: "#e6dcc0", fontFamily: "Tahoma, sans-serif", fontSize: 12, padding: "0 8px", outline: "none" }}
            >
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {`#${s.id}  ${s.ip}:${s.port}  ·  ${s.currentPlayers}/${s.maxPlayers}`}
                </option>
              ))}
            </select>
            {error && <div style={{ fontSize: 11, color: "#ff8c8c", textAlign: "center" }}>{error}</div>}
            <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
              <L2Button onClick={onEnterWorld} disabled={busy || selectedServer == null} variant="large" width={122}>{busy ? "…" : "OK"}</L2Button>
              <L2Button onClick={cancelServerSelect} disabled={busy} width={122}>Cancel</L2Button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom-right corner links (always visible) */}
      <div style={{ position: "fixed", right: 14, bottom: 36, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, zIndex: 50, fontFamily: "Tahoma, sans-serif", fontSize: 11 }}>
        <a href="https://l2.slave.gr/register" target="_blank" rel="noreferrer" className="l2-corner-link">New Account ↗</a>
        <a href="http://l2.slave.gr/forgot-password" target="_blank" rel="noreferrer" className="l2-corner-link">Lost Account ↗</a>
        <a href="https://l2.slave.gr" target="_blank" rel="noreferrer" className="l2-corner-link">Links ↗</a>
        <Link to="/cdn-cache" className="l2-corner-link">Settings ↗</Link>
      </div>

      {statusLog.length > 0 && (
        <details className="l2-frame" style={{ position: "fixed", bottom: 36, left: 12, maxWidth: 420, padding: "6px 10px", fontSize: 10, fontFamily: "monospace", color: "#9a9078", zIndex: 50 }}>
          <summary style={{ cursor: "pointer", letterSpacing: 2 }}>PROTOCOL LOG ({statusLog.length})</summary>
          <pre style={{ marginTop: 6, maxHeight: 200, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{statusLog.join("\n")}</pre>
        </details>
      )}

      <div className="l2-footer">
        <span className="font-display tracking-[0.3em] text-gold/80">L2</span>
        <span className="sep">|</span>
        <span className="font-display tracking-[0.4em] text-foreground/80">L2SLAVE</span>
        <span className="sep">|</span>
        <a href="https://l2.slave.gr" target="_blank" rel="noreferrer">l2.slave.gr</a>
        <span className="sep">·</span>
        <span>Unofficial web client</span>
      </div>
    </SpriteProvider>
  );
}
