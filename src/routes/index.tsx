import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { L2LoginClient, type GameServer, type LoginEvent } from "@/lib/l2-protocol/login-client";
import { L2GameClient, setGameConnection, type GameEvent } from "@/lib/l2-protocol/game-client";
import { SpriteProvider } from "@/components/hud/L2Sprite";
import { L2LoginScreen } from "@/components/hud/L2LoginScreen";
const serverSelect = { url: "/hud/screens/LogonScreen.png" };

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
    } catch {
      /* ignore */
    }
  }, []);

  function pushStatus(msg: string) {
    setStatusLog((l) => {
      const next = [...l.slice(-199), msg];
      try {
        sessionStorage.setItem("l2_gslog", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const loginRef = useRef<L2LoginClient | null>(null);

  async function doLogin(id: string, pw: string) {
    setUsername(id);
    setError(null);
    setServers([]);
    setStatusLog([]);
    try {
      sessionStorage.removeItem("l2_gslog");
    } catch {
      /* ignore */
    }
    setBusy(true);
    const host = "l2server.slave.gr";
    const port = 2106;
    try {
      const client = new L2LoginClient({
        host,
        port,
        username: id,
        password: pw,
        onEvent: (ev: LoginEvent) => {
          if (ev.type === "status") pushStatus(ev.message);
          else if (ev.type === "init") pushStatus(`Init: protocol=${ev.protocolRevision}`);
          else if (ev.type === "gg-ok") pushStatus("GameGuard OK");
          else if (ev.type === "login-ok") pushStatus("LoginOk — requesting server list");
          else if (ev.type === "raw")
            pushStatus(
              `← opcode 0x${ev.opcode.toString(16).padStart(2, "0")} (${ev.bytes.length}B)`,
            );
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
    try {
      loginRef.current?.close();
    } catch {
      /* ignore */
    }
    loginRef.current = null;
    setServers([]);
    setSelectedServer(null);
    setPhase("login");
  }

  async function onEnterWorld() {
    if (selectedServer == null) return;
    const login = loginRef.current;
    const server = servers.find((s) => s.id === selectedServer);
    if (!login || !server) {
      setError("Login session lost — please re-authenticate.");
      setPhase("login");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      pushStatus(`Requesting PlayOk for server #${server.id}…`);
      const playEv = await login.selectServer(server.id);
      if (playEv.type !== "play-ok") {
        setError(
          playEv.type === "login-fail" ? `PlayOk failed: ${playEv.reason}` : "PlayOk failed",
        );
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
    <SpriteProvider>
      {phase === "login" ? (
        <L2LoginScreen onLogin={doLogin} busy={busy} error={error} />
      ) : (
        <div style={{ position: "fixed", inset: 0, background: "#000", overflow: "hidden" }}>
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: "min(100vw, 177.778vh)",
              height: "min(100vh, 56.25vw)",
              background: `url(${serverSelect.url}) center/contain no-repeat`,
            }}
          >
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)",
                width: "min(440px, 70%)",
                padding: "22px 26px",
                background:
                  "linear-gradient(to bottom, rgba(28,24,16,0.96), rgba(10,8,6,0.96))",
                border: "1px solid rgba(204,180,120,0.55)",
                borderRadius: 4,
                boxShadow: "0 10px 30px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,235,180,0.15)",
                color: "#e6dcb6",
                fontFamily: "Arial, Helvetica, sans-serif",
              }}
            >
              <div
                style={{
                  fontSize: 16,
                  letterSpacing: 2,
                  textAlign: "center",
                  marginBottom: 14,
                  textShadow: "0 1px 2px #000",
                  color: "#f0e3b3",
                }}
              >
                SERVER SELECTION
              </div>
              <div style={{ maxHeight: 220, overflowY: "auto", marginBottom: 14 }}>
                {servers.length === 0 ? (
                  <div style={{ textAlign: "center", opacity: 0.7, padding: 12 }}>No servers</div>
                ) : (
                  servers.map((s) => {
                    const active = s.id === selectedServer;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelectedServer(s.id)}
                        onDoubleClick={onEnterWorld}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          padding: "8px 12px",
                          marginBottom: 4,
                          background: active
                            ? "linear-gradient(to bottom, rgba(120,96,52,0.85), rgba(60,46,24,0.85))"
                            : "rgba(255,255,255,0.04)",
                          border: `1px solid ${active ? "rgba(230,210,140,0.8)" : "rgba(150,130,90,0.35)"}`,
                          borderRadius: 3,
                          color: active ? "#fff8d8" : "#d8cea8",
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        <span style={{ opacity: 0.7 }}>#{s.id}</span>{" "}
                        <span>
                          {s.ip}:{s.port}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button
                  type="button"
                  onClick={onEnterWorld}
                  disabled={busy || selectedServer == null}
                  style={{
                    padding: "8px 22px",
                    background:
                      "linear-gradient(to bottom, rgba(107,98,74,0.94), rgba(43,39,30,0.98))",
                    border: "1px solid rgba(230,215,156,0.7)",
                    borderRadius: 3,
                    color: "#fff",
                    cursor: busy || selectedServer == null ? "default" : "pointer",
                    opacity: busy || selectedServer == null ? 0.5 : 1,
                    fontSize: 13,
                    textShadow: "0 1px 2px #000",
                  }}
                >
                  {busy ? "…" : "OK"}
                </button>
                <button
                  type="button"
                  onClick={cancelServerSelect}
                  disabled={busy}
                  style={{
                    padding: "8px 22px",
                    background:
                      "linear-gradient(to bottom, rgba(80,72,52,0.9), rgba(30,26,20,0.96))",
                    border: "1px solid rgba(180,160,110,0.55)",
                    borderRadius: 3,
                    color: "#e4dcc2",
                    cursor: "pointer",
                    fontSize: 13,
                    textShadow: "0 1px 2px #000",
                  }}
                >
                  Cancel
                </button>
              </div>
              {error && (
                <div
                  style={{
                    marginTop: 12,
                    color: "#ff8c8c",
                    fontSize: 12,
                    textAlign: "center",
                    textShadow: "0 1px 2px #000",
                  }}
                >
                  {error}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </SpriteProvider>
  );
}
