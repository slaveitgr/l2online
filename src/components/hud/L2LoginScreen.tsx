import { useState } from "react";


const BG = "/hud/screens/LogonScreen.png";

/**
 * Lozenge-shaped input matching the Lineage 2 login client:
 * thin gold/bronze beveled frame with chamfered ends and a dark interior.
 */
function LoginField({
  value,
  onChange,
  type = "text",
  placeholder,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  onEnter?: () => void;
}) {
  // 12px chamfer on each end produces the angled-pill silhouette
  const clip =
    "polygon(12px 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 12px 100%, 0 50%)";
  return (
    <div
      style={{
        width: 460,
        height: 38,
        padding: 1,
        clipPath: clip,
        background:
          "linear-gradient(180deg,#d6b06a 0%,#8a6a36 45%,#3a2e1c 55%,#7a5a2c 100%)",
        boxShadow: "0 1px 6px rgba(0,0,0,0.6)",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          clipPath: clip,
          background:
            "linear-gradient(180deg,#1a1814 0%,#0c0a08 55%,#181410 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 20px",
        }}
      >
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
          spellCheck={false}
          autoComplete="off"
          data-lpignore="true"
          data-form-type="other"
          style={{
            width: "100%",
            height: "100%",
            border: 0,
            outline: "none",
            background: "transparent",
            color: "#e8dcb8",
            textAlign: "center",
            fontFamily: "'Times New Roman', Georgia, serif",
            fontSize: 18,
            letterSpacing: 1,
            textShadow: "0 1px 2px rgba(0,0,0,0.9)",
          }}
        />
      </div>
    </div>
  );
}

/**
 * Beveled rectangular button matching the client (Log In / Exit).
 */
function LoginButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const [down, setDown] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setDown(false);
      }}
      onMouseDown={() => setDown(true)}
      onMouseUp={() => setDown(false)}
      style={{
        width: 200,
        height: 50,
        padding: 1,
        border: 0,
        background: disabled
          ? "linear-gradient(180deg,#5a4a2a,#2a2218)"
          : "linear-gradient(180deg,#d6b06a,#7a5a2c 45%,#3a2e1c 55%,#a07a3c)",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.55 : 1,
        boxShadow: down
          ? "inset 0 2px 6px rgba(0,0,0,0.7)"
          : "0 2px 8px rgba(0,0,0,0.6)",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: down
            ? "linear-gradient(180deg,#15120e,#262017)"
            : hover
            ? "linear-gradient(180deg,#3a3226,#1d1812)"
            : "linear-gradient(180deg,#2b2418,#15120e)",
          color: "#e8dcb8",
          fontFamily: "'Times New Roman', Georgia, serif",
          fontSize: 22,
          letterSpacing: 1,
          textShadow: "0 1px 2px rgba(0,0,0,0.9)",
        }}
      >
        {children}
      </div>
    </button>
  );
}

export function L2LoginScreen({
  onLogin,
  error,
  busy,
}: {
  onLogin?: (id: string, pw: string) => void;
  error?: string | null;
  busy?: boolean;
}) {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const submit = () => {
    if (!busy && id.trim()) onLogin?.(id.trim(), pw);
  };

  return (
    <div
      suppressHydrationWarning
      style={{
        position: "fixed",
        inset: 0,
        background: "#000",
        fontFamily: "Tahoma, Geneva, sans-serif",
        overflow: "hidden",
      }}
    >
      <video
        src="/hud/videos/login_web.mp4"
        autoPlay
        muted
        loop
        playsInline
        poster={BG}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at center, transparent 0%, transparent 50%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "55%",
          transform: "translate(-50%, -50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
        }}
      >
        <LoginField value={id} onChange={setId} onEnter={submit} />
        <LoginField
          value={pw}
          onChange={setPw}
          type="password"
          placeholder="Password"
          onEnter={submit}
        />

        <div style={{ display: "flex", gap: 24, marginTop: 14 }}>
          <LoginButton onClick={submit} disabled={busy || !id.trim()}>
            {busy ? "Connecting…" : "Log In"}
          </LoginButton>
          <LoginButton>Exit</LoginButton>
        </div>

        {error ? (
          <div
            style={{
              marginTop: 8,
              maxWidth: 460,
              textAlign: "center",
              fontSize: 13,
              color: "#ff8c8c",
              textShadow: "0 1px 2px #000",
            }}
          >
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}
{/* avoid unused L2Button import warning when sprite primitives aren't used here */}
export const _unused = L2Button;
