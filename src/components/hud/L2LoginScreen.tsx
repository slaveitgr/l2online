import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { L2Button, L2Frame, L2Sprite, useSprites } from "./L2Sprite";

const CLIENT_LOGON = "/hud/screens/LogonScreen.png";
const CLIENT_VIDEO = "/hud/videos/login_web.mp4";

const REQUIRED_CLIENT_REFS = [
  "L2UI_CH3.LoginWnd.aboutOTPIcon_over",
  "L2UI_CH3.LoginWnd.aboutOTPIcon_down",
  "L2UI_CT1.Button.Button_DF_Click",
  "L2UI_CT1.GroupBox.GroupBox_DF",
  "L2UI.Control.CheckBox_checked",
] as const;

const fieldClip =
  "polygon(10px 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 10px 100%, 0 50%)";

type AssetState = "loading" | "ok" | "failed";

const textShadow = "0 1px 2px #000, 0 0 4px #000";

function Field({
  value,
  onChange,
  type = "text",
  placeholder,
  onEnter,
  style,
  name,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "password";
  placeholder?: string;
  onEnter?: () => void;
  style: CSSProperties;
  name: string;
  autoFocus?: boolean;
}) {
  const isPw = type === "password";
  return (
    <div
      style={{
        position: "absolute",
        width: "13.55%",
        height: isPw ? "2.55%" : "2.5%",
        filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.95))",
        clipPath: fieldClip,
        background:
          "linear-gradient(90deg, rgba(88,78,52,0.85), rgba(238,229,174,0.95) 7%, rgba(88,78,52,0.7) 15%, rgba(84,72,47,0.42) 50%, rgba(236,228,170,0.95) 93%, rgba(70,58,38,0.8))",
        padding: 1,
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 1,
          clipPath: fieldClip,
          background:
            "linear-gradient(to bottom, rgba(38,37,29,0.96) 0%, rgba(9,10,8,0.98) 48%, rgba(28,27,21,0.96) 100%)",
        }}
      />
      <input
        suppressHydrationWarning
        type="text"
        name={name}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        data-lpignore="true"
        data-1p-ignore="true"
        data-bwignore="true"
        data-form-type="other"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        style={{
          position: "absolute",
          zIndex: 2,
          inset: 0,
          width: "100%",
          height: "100%",
          border: 0,
          outline: 0,
          background: "transparent",
          color: "#d7ceb0",
          textAlign: "center",
          fontFamily: "Arial, Helvetica, sans-serif",
          fontSize: "clamp(10px, 0.78vw, 15px)",
          lineHeight: "100%",
          letterSpacing: 0,
          textShadow,
          padding: "0 18px",
          caretColor: "#e6ddbb",
          ...(isPw
            ? ({ WebkitTextSecurity: "disc" } as CSSProperties & { WebkitTextSecurity: string })
            : {}),
        }}
      />
    </div>
  );
}

function LegacyButton({
  children,
  onClick,
  disabled,
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  style: CSSProperties;
}) {
  return (
    <L2Button
      onClick={onClick}
      disabled={disabled}
      height={29}
      width="5.45%"
      style={{
        position: "absolute",
        fontSize: "clamp(9px, 0.66vw, 13px)",
        color: disabled ? "#7a7058" : "#e4dcc2",
        ...style,
      }}
    >
      {children}
    </L2Button>
  );
}

function Panel({ title, children, style }: { title: string; children: ReactNode; style: CSSProperties }) {
  return (
    <L2Frame
      style={{
        position: "absolute",
        padding: 9,
        background: "rgba(8, 7, 5, 0.72)",
        boxShadow: "0 6px 18px rgba(0,0,0,0.72)",
        color: "#d8c996",
        fontSize: 11,
        lineHeight: 1.35,
        textShadow,
        pointerEvents: "auto",
        ...style,
      }}
    >
      <div style={{ color: "#f2df9b", fontSize: 12, fontWeight: 700, marginBottom: 7, letterSpacing: 0 }}>
        {title}
      </div>
      {children}
    </L2Frame>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: 7,
        marginRight: 6,
        background: ok ? "#8fcf62" : "#c96a55",
        boxShadow: ok ? "0 0 5px rgba(143,207,98,0.75)" : "0 0 5px rgba(201,106,85,0.6)",
      }}
    />
  );
}

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
      <span style={{ color: "#a99b72" }}>
        {typeof ok === "boolean" ? <StatusDot ok={ok} /> : null}
        {label}
      </span>
      <span style={{ color: "#efe3bd", textAlign: "right", overflowWrap: "anywhere" }}>{value}</span>
    </div>
  );
}

function MenuPanel() {
  const menuItems = ["Account", "Options", "Support", "Patch Notes"];
  return (
    <Panel title="MENU" style={{ left: "3.2%", top: "4%", width: 216 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {menuItems.map((item) => (
          <L2Button key={item} variant="small" height={22} style={{ width: "100%" }}>
            {item}
          </L2Button>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 9 }}>
        <L2Sprite refId="L2UI_CH3.LoginWnd.aboutOTPIcon_over" width={18} height={18} />
        <span>OTP / account help assets from L2UI_CH3</span>
      </div>
    </Panel>
  );
}

function ClientAssetPanel({ screenState, videoState }: { screenState: AssetState; videoState: AssetState }) {
  const sprites = useSprites();
  const found = REQUIRED_CLIENT_REFS.filter((ref) => sprites?.has(ref)).length;
  const manifestCount = useMemo(
    () => (sprites ? Object.values(sprites.manifest).filter(Boolean).length : 0),
    [sprites],
  );

  return (
    <Panel title="CLIENT DATA" style={{ right: "3.2%", top: "4%", width: 300 }}>
      <Row label="video" value={CLIENT_VIDEO} ok={videoState === "ok"} />
      <Row label="fallback" value={CLIENT_LOGON} ok={screenState === "ok"} />
      <Row label="ui manifest" value={sprites ? `${manifestCount} textures` : "loading"} ok={Boolean(sprites)} />
      <Row label="required refs" value={`${found}/${REQUIRED_CLIENT_REFS.length}`} ok={found === REQUIRED_CLIENT_REFS.length} />
      <div style={{ height: 1, background: "rgba(210,185,110,0.22)", margin: "8px 0" }} />
      {REQUIRED_CLIENT_REFS.map((ref) => (
        <Row key={ref} label={ref.split(".").pop() ?? ref} value={sprites?.has(ref) ? "ok" : "missing"} ok={Boolean(sprites?.has(ref))} />
      ))}
    </Panel>
  );
}

function ServerInfoPanel({ busy }: { busy?: boolean }) {
  return (
    <Panel title="SERVER" style={{ left: "3.2%", bottom: "4%", width: 260 }}>
      <Row label="login" value="l2server.slave.gr:2106" ok />
      <Row label="protocol" value="502" ok />
      <Row label="state" value={busy ? "connecting" : "ready"} ok={!busy} />
    </Panel>
  );
}

function LogPanel({ statusLog = [] }: { statusLog?: string[] }) {
  const latest = statusLog.slice(-7);
  return (
    <Panel title="CONNECTION LOG" style={{ right: "3.2%", bottom: "4%", width: 340, minHeight: 104 }}>
      {latest.length ? (
        latest.map((line, idx) => (
          <div key={`${idx}-${line}`} style={{ color: idx === latest.length - 1 ? "#fff0b8" : "#c8bb8a", marginBottom: 3 }}>
            {line}
          </div>
        ))
      ) : (
        <div style={{ color: "#a99b72" }}>Waiting for login handshake.</div>
      )}
    </Panel>
  );
}

export function L2LoginScreen({
  onLogin,
  error,
  busy,
  statusLog,
}: {
  onLogin?: (id: string, pw: string) => void;
  error?: string | null;
  busy?: boolean;
  statusLog?: string[];
}) {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [screenState, setScreenState] = useState<AssetState>("loading");
  const [videoState, setVideoState] = useState<AssetState>("loading");

  useEffect(() => {
    let alive = true;
    const img = new Image();
    img.onload = () => alive && setScreenState("ok");
    img.onerror = () => alive && setScreenState("failed");
    img.src = CLIENT_LOGON;
    return () => {
      alive = false;
    };
  }, []);

  const submit = () => {
    if (!busy && id.trim()) onLogin?.(id.trim(), pw);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        background: "#050306",
        color: "#d6cfaa",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: "max(100vw, 177.7778vh)",
          height: "max(56.25vw, 100vh)",
          transform: "translate(-50%, -50%)",
          background: `#000 url(${CLIENT_LOGON}) center/cover no-repeat`,
        }}
      >
        <video
          src={CLIENT_VIDEO}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster={CLIENT_LOGON}
          onCanPlay={() => setVideoState("ok")}
          onLoadedData={() => setVideoState("ok")}
          onError={() => setVideoState("failed")}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            pointerEvents: "none",
          }}
        />
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.08)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none" }}>
          <MenuPanel />
          <ClientAssetPanel screenState={screenState} videoState={videoState} />
          <ServerInfoPanel busy={busy} />
          <LogPanel statusLog={statusLog} />
          <Field
            name="l2_account"
            autoFocus
            value={id}
            onChange={setId}
            onEnter={submit}
            style={{ left: "42.98%", top: "52.62%", pointerEvents: "auto" }}
          />
          <Field
            name="l2_secret"
            type="password"
            placeholder="Password"
            value={pw}
            onChange={setPw}
            onEnter={submit}
            style={{ left: "43.08%", top: "55.37%", pointerEvents: "auto" }}
          />
          <LegacyButton
            onClick={submit}
            disabled={busy || !id.trim()}
            style={{ left: "44.25%", top: "58.55%", pointerEvents: "auto" }}
          >
            {busy ? "..." : "Log In"}
          </LegacyButton>
          <LegacyButton style={{ left: "50.10%", top: "58.55%", pointerEvents: "auto" }}>Exit</LegacyButton>
          {error ? (
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "63%",
                transform: "translateX(-50%)",
                color: "#ff8c8c",
                fontSize: 13,
                textShadow,
                textAlign: "center",
                maxWidth: 520,
              }}
            >
              {error}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
