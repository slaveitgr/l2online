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
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.55) 100%)" }} />
          <L2Frame
            refId="L2UI_CT1.GroupBox_Black"
            style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 460, padding: "16px 20px", background: "rgba(6,7,9,0.62)", color: "#e6dcc0" }}
          >
            <div style={{ textAlign: "center", letterSpacing: 3, fontSize: 14, fontWeight: 700, color: "#e6c87a", textShadow: "0 1px 2px #000", marginBottom: 14 }}>SELECT SERVER</div>
            <select
              value={selectedServer ?? ""}
              onChange={(e) => setSelectedServer(Number(e.target.value))}
              style={{ width: "100%", height: 26, background: "#0a0a08", border: "1px solid #5a4e32", color: "#e6dcc0", fontFamily: "Tahoma, sans-serif", fontSize: 12, padding: "0 6px", outline: "none" }}
            >
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {`#${s.id}  ${s.ip}:${s.port}  ·  ${s.currentPlayers}/${s.maxPlayers}`}
                </option>
              ))}
            </select>
            {error && <div style={{ marginTop: 8, fontSize: 11, color: "#e06a6a", textAlign: "center" }}>{error}</div>}
            <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 14 }}>
              <L2Button onClick={onEnterWorld} disabled={busy || selectedServer == null} variant="large" width={120}>{busy ? "…" : "OK"}</L2Button>
              <L2Button onClick={cancelServerSelect} disabled={busy} width={90}>Cancel</L2Button>
            </div>
          </L2Frame>
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
