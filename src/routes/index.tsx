import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { L2LoginClient, type GameServer, type LoginEvent } from "@/lib/l2-protocol/login-client";
import { L2GameClient, setGameConnection, type GameEvent } from "@/lib/l2-protocol/game-client";
import { SpriteProvider } from "@/components/hud/L2Sprite";
import { L2LoginScreen } from "@/components/hud/L2LoginScreen";
import { L2LauncherShell } from "@/components/hud/L2LauncherShell";
import {
  readSsoTokenFromUrl,
  stripSsoFromUrl,
  verifySsoToken,
  saveSsoSession,
  loadSsoSession,
  clearSsoSession,
} from "@/lib/l2-protocol/sso";

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
type SsoPhase = "checking" | "ready" | "failed";

function Launcher() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [phase, setPhase] = useState<Phase>("login");
  const [servers, setServers] = useState<GameServer[]>([]);
  const [selectedServer, setSelectedServer] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusLog, setStatusLog] = useState<string[]>([]);
  // SSR-safe initial state: always "ready", then upgrade to "checking" inside
  // the effect once we know we are on the client and have a token/session.
  const [ssoPhase, setSsoPhase] = useState<SsoPhase>("ready");
  const loginRef = useRef<L2LoginClient | null>(null);
  const autoEnterRef = useRef(false);
  const ssoRanRef = useRef(false);

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

  // SSO auto-login: ?sso=<token> OR stored l2.session in localStorage.
  // Runs once on mount, client-only.
  useEffect(() => {
    if (ssoRanRef.current) return;
    ssoRanRef.current = true;

    const urlToken = readSsoTokenFromUrl();
    const stored = loadSsoSession();

    if (!urlToken && !stored) return;

    setSsoPhase("checking");

    (async () => {
      if (urlToken) {
        // single-use: strip immediately so refresh / share doesn't reuse it
        stripSsoFromUrl();
        const res = await verifySsoToken(urlToken);
        if (!res.ok) {
          clearSsoSession();
          setError("SSO session expired, login manually.");
          setSsoPhase("failed");
          return;
        }
        saveSsoSession({
          login: res.login,
          sessionToken: res.sessionToken,
          expiresAt: res.expiresAt,
        });
        autoEnterRef.current = true;
        await doLogin(res.login, res.sessionToken);
      } else if (stored) {
        autoEnterRef.current = true;
        await doLogin(stored.login, stored.sessionToken);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



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

    try {
      const client = new L2LoginClient({
        host: "l2server.slave.gr",
        port: 2106,
        username: id,
        password: pw,
        onEvent: (ev: LoginEvent) => {
          if (ev.type === "status") pushStatus(ev.message);
          else if (ev.type === "init") pushStatus(`Init: protocol=${ev.protocolRevision}`);
          else if (ev.type === "gg-ok") pushStatus("GameGuard OK");
          else if (ev.type === "login-ok") pushStatus("LoginOk — requesting server list");
          else if (ev.type === "raw")
            pushStatus(`← opcode 0x${ev.opcode.toString(16).padStart(2, "0")} (${ev.bytes.length}B)`);
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
    // user explicitly bailed — don't auto-login again with the stored token
    clearSsoSession();
    autoEnterRef.current = false;
    setSsoPhase("ready");
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

  // After auto-login (SSO or stored session), enter the world automatically
  // once the server list arrives — user never sees server-select.
  useEffect(() => {
    if (!autoEnterRef.current) return;
    if (phase !== "server-select") return;
    if (selectedServer == null) return;
    if (busy) return;
    autoEnterRef.current = false;
    void onEnterWorld();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, selectedServer, busy]);

  // If auto-login fails, fall back to the manual login screen.
  useEffect(() => {
    if (ssoPhase === "checking" && error && !busy && phase === "login") {
      clearSsoSession();
      autoEnterRef.current = false;
      setSsoPhase("failed");
    }
  }, [ssoPhase, error, busy, phase]);

  if (ssoPhase === "checking") {
    return (
      <SpriteProvider>
        <L2LauncherShell logs={statusLog}>
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "55%",
              transform: "translate(-50%, -50%)",
              color: "#e6dcb6",
              fontFamily: "Arial, Helvetica, sans-serif",
              fontSize: 13,
              textShadow: "0 1px 2px #000, 0 0 4px #000",
              pointerEvents: "none",
            }}
          >
            Signing in…
          </div>
        </L2LauncherShell>
      </SpriteProvider>
    );
  }

  return (
    <SpriteProvider>
      {phase === "login" ? (
        <L2LoginScreen onLogin={doLogin} busy={busy} error={error} statusLog={statusLog} />
      ) : (
        <L2LauncherShell logs={statusLog}>
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "62%",
              transform: "translate(-50%, -50%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
              pointerEvents: "auto",
            }}
          >
            {/* Server selection bar (faithful to client screenshot) */}
            <div
              style={{
                display: "flex",
                alignItems: "stretch",
                background:
                  "linear-gradient(180deg,#1c2240 0%,#0a0d22 55%,#1c2240 100%)",
                border: "1px solid #6a5630",
                boxShadow:
                  "inset 0 1px 0 rgba(255,235,180,0.08), 0 4px 10px rgba(0,0,0,0.7)",
                fontFamily: "Arial, Helvetica, sans-serif",
                fontSize: 12,
                color: "#cfc6a4",
                height: 30,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "0 16px",
                  display: "flex",
                  alignItems: "center",
                  background:
                    "linear-gradient(180deg,#3b4a8a 0%,#1e2657 100%)",
                  borderRight: "1px solid #6a5630",
                  color: "#e6dcb6",
                  textShadow: "0 1px 2px #000",
                  letterSpacing: 0.5,
                }}
              >
                Server
              </div>
              <div
                style={{
                  display: "flex",
                  maxWidth: 520,
                  overflowX: "auto",
                }}
              >
                {servers.length === 0 ? (
                  <div
                    style={{
                      padding: "0 18px",
                      display: "flex",
                      alignItems: "center",
                      opacity: 0.7,
                    }}
                  >
                    No servers
                  </div>
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
                          padding: "0 18px",
                          background: active
                            ? "linear-gradient(180deg,#4a5a9c 0%,#222a5c 100%)"
                            : "transparent",
                          border: 0,
                          borderRight: "1px solid rgba(106,86,48,0.5)",
                          color: active ? "#fff" : "#cfc6a4",
                          fontSize: 12,
                          cursor: "pointer",
                          textShadow: "0 1px 2px #000",
                          whiteSpace: "nowrap",
                          fontWeight: active ? 700 : 400,
                        }}
                      >
                        <span>L2-Slave</span>
                        <span style={{ marginLeft: 12, color: "#9ed897" }}>
                          {["Down", "Light", "Normal", "Heavy", "Full"][s.status] ?? ""}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
              <button
                type="button"
                onClick={onEnterWorld}
                disabled={busy || selectedServer == null}
                style={dialogBtn(busy || selectedServer == null)}
              >
                {busy ? "…" : "OK"}
              </button>
              <button
                type="button"
                onClick={cancelServerSelect}
                disabled={busy}
                style={dialogBtn(false)}
              >
                Cancel
              </button>
            </div>

            {error ? (
              <div
                style={{
                  marginTop: 8,
                  color: "#ff8c8c",
                  fontSize: 12,
                  textAlign: "center",
                  textShadow: "0 1px 2px #000",
                  maxWidth: 480,
                }}
              >
                {error}
              </div>
            ) : null}
          </div>
        </L2LauncherShell>
      )}
    </SpriteProvider>
  );
}

function dialogBtn(disabled: boolean): React.CSSProperties {
  return {
    width: 92,
    height: 26,
    background: "linear-gradient(180deg,#3a3424 0%,#1f1a10 55%,#2a2418 100%)",
    border: "1px solid #6a5630",
    boxShadow: "inset 0 1px 0 rgba(255,235,180,0.10), 0 2px 4px rgba(0,0,0,0.7)",
    color: disabled ? "#7a7058" : "#e6dcb6",
    fontFamily: "Arial, Helvetica, sans-serif",
    fontSize: 12,
    letterSpacing: 0.5,
    textShadow: "0 1px 2px #000, 0 0 4px #000",
    cursor: disabled ? "default" : "pointer",
  };
}

