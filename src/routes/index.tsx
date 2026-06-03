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
            <select
              value={selectedServer ?? ""}
              onChange={(e) => setSelectedServer(Number(e.target.value))}
              aria-label="Server"
              style={{
                position: "absolute",
                left: "34.5%",
                top: "75.5%",
                width: "31%",
                height: "3.9%",
                opacity: 0.01,
              }}
            >
              {servers.map((s) => (
                <option key={s.id} value={s.id}>{`#${s.id} ${s.ip}:${s.port}`}</option>
              ))}
            </select>
            <button
              aria-label="OK"
              onClick={onEnterWorld}
              disabled={busy || selectedServer == null}
              style={{
                position: "absolute",
                left: "43.2%",
                top: "80.8%",
                width: "6.6%",
                height: "3.3%",
                opacity: 0,
                border: 0,
                cursor: "pointer",
              }}
            />
            <button
              aria-label="Cancel"
              onClick={cancelServerSelect}
              disabled={busy}
              style={{
                position: "absolute",
                left: "50.2%",
                top: "80.8%",
                width: "6.5%",
                height: "3.3%",
                opacity: 0,
                border: 0,
                cursor: "pointer",
              }}
            />
            {error && (
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "85%",
                  transform: "translateX(-50%)",
                  fontSize: 11,
                  color: "#ff8c8c",
                  textAlign: "center",
                  textShadow: "0 1px 2px #000",
                }}
              >
                {error}
              </div>
            )}
          </div>
        </div>
      )}
    </SpriteProvider>
  );
}
