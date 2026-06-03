import { useState } from "react";

const BG = "/hud/screens/LogonScreen.png";

/**
 * Login field rendered like the Windows client:
 *  - black chevron arrow on each outer side
 *  - light/white pill input with chamfered ends and gold edges
 *  - small "..." badge on the right inside the input
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
  const clip =
    "polygon(14px 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 14px 100%, 0 50%)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
      {/* left chevron */}
      <div
        style={{
          width: 22,
          height: 38,
          clipPath: "polygon(100% 0, 100% 100%, 0 50%)",
          background:
            "linear-gradient(180deg,#3a2e1c 0%,#0a0805 55%,#2a2014 100%)",
          marginRight: -4,
        }}
      />
      {/* field */}
      <div
        style={{
          width: 440,
          height: 38,
          padding: 1,
          clipPath: clip,
          background:
            "linear-gradient(180deg,#e8c98a 0%,#7a5a2c 50%,#3a2e1c 100%)",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            clipPath: clip,
            background:
              "linear-gradient(180deg,#f3ece0 0%,#e2d6bf 55%,#cdbe9f 100%)",
            display: "flex",
            alignItems: "center",
            padding: "0 36px 0 20px",
            position: "relative",
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
              color: "#000",
              textAlign: "center",
              fontFamily: "'Times New Roman', Georgia, serif",
              fontSize: 20,
              letterSpacing: 1,
            }}
          />
          <span
            style={{
              position: "absolute",
              right: 14,
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: 14,
              color: "#3a2e1c",
              letterSpacing: 2,
            }}
          >
            ···
          </span>
        </div>
      </div>
      {/* right chevron */}
      <div
        style={{
          width: 22,
          height: 38,
          clipPath: "polygon(0 0, 100% 50%, 0 100%)",
          background:
            "linear-gradient(180deg,#3a2e1c 0%,#0a0805 55%,#2a2014 100%)",
          marginLeft: -4,
        }}
      />
    </div>
  );
}

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
        width: 220,
        height: 56,
        padding: 1,
        border: 0,
        background:
          "linear-gradient(180deg,#caa363 0%,#6e5326 50%,#3a2e1c 100%)",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.55 : 1,
        boxShadow: down ? "inset 0 2px 6px rgba(0,0,0,0.7)" : "0 2px 8px rgba(0,0,0,0.6)",
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
            ? "linear-gradient(180deg,#100d09,#231d14)"
            : hover
            ? "linear-gradient(180deg,#2a2418,#15110b)"
            : "linear-gradient(180deg,#1a160f,#0a0805)",
          color: "#e8dcb8",
          fontFamily: "'Times New Roman', Georgia, serif",
          fontSize: 26,
          letterSpacing: 1,
          textShadow: "0 1px 2px rgba(0,0,0,0.9)",
        }}
      >
        {children}
      </div>
    </button>
  );
}

function FooterLink({ children }: { children: React.ReactNode }) {
  return (
    <a
      href="#"
      onClick={(e) => e.preventDefault()}
      style={{
        color: "#e8dcb8",
        fontFamily: "'Times New Roman', Georgia, serif",
        fontSize: 14,
        textDecoration: "none",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        textShadow: "0 1px 2px rgba(0,0,0,0.9)",
      }}
    >
      {children} <span style={{ fontSize: 12 }}>↗</span>
    </a>
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
            "radial-gradient(circle at center, transparent 0%, transparent 55%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      {/* Login stack */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "58%",
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
          onEnter={submit}
        />

        <div style={{ display: "flex", gap: 22, marginTop: 22 }}>
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

      {/* Bottom-left: protocol log */}
      <div
        style={{
          position: "absolute",
          left: 14,
          bottom: 28,
          fontFamily: "'Courier New', monospace",
          fontSize: 13,
          color: "#e8dcb8",
          letterSpacing: 2,
          textShadow: "0 1px 2px #000",
        }}
      >
        ▶ PROTOCOL LOG (0)
      </div>

      {/* Bottom-right: nav links */}
      <div
        style={{
          position: "absolute",
          right: 18,
          bottom: 26,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 6,
        }}
      >
        <FooterLink>New Account</FooterLink>
        <FooterLink>Lost Account</FooterLink>
        <FooterLink>Links</FooterLink>
        <FooterLink>Settings</FooterLink>
      </div>

      {/* Bottom-center: brand strip */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: 8,
          transform: "translateX(-50%)",
          display: "flex",
          gap: 28,
          fontFamily: "'Times New Roman', Georgia, serif",
          fontSize: 13,
          color: "#cdbe9f",
          letterSpacing: 4,
          textShadow: "0 1px 2px #000",
          whiteSpace: "nowrap",
        }}
      >
        <span>L2</span>
        <span>L2SLAVE</span>
        <span style={{ letterSpacing: 1 }}>l2.slave.gr</span>
        <span style={{ letterSpacing: 1 }}>Unofficial web client</span>
      </div>
    </div>
  );
}
