import { useState, type CSSProperties } from "react";
const loginVideo = { url: "/hud/videos/login_web.mp4" };
const loginPoster = { url: "/hud/screens/LogonScreen.png" };

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
  const clip = "polygon(0 0, calc(100% - 20px) 0, 100% 50%, calc(100% - 20px) 100%, 0 100%)";
  return (
    <div
      style={{
        width: "39.6%",
        height: "4.1%",
        minHeight: 34,
        padding: "2px 24px 2px 2px",
        clipPath: clip,
        background:
          "linear-gradient(180deg, rgba(228,225,210,0.95), rgba(66,59,48,0.95) 47%, rgba(236,232,216,0.9) 52%, rgba(56,48,36,0.95))",
        filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.82))",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          clipPath: clip,
          background:
            "linear-gradient(180deg, rgba(24,22,18,0.9), rgba(5,5,5,0.9) 58%, rgba(24,20,14,0.94))",
          display: "flex",
          alignItems: "center",
          padding: "0 46px 0 24px",
          position: "relative",
        }}
      >
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
          spellCheck={false}
          autoComplete="new-password"
          autoCorrect="off"
          autoCapitalize="off"
          data-lpignore="true"
          data-1p-ignore="true"
          data-bwignore="true"
          data-form-type="other"
          name={type === "password" ? "l2_secret" : "l2_account"}
          style={{
            width: "100%",
            height: "100%",
            border: 0,
            outline: "none",
            background: "transparent",
            color: "#e9e0c9",
            textAlign: "center",
            fontFamily: "Tahoma, Geneva, sans-serif",
            fontSize: "clamp(18px, 1.45vw, 28px)",
            letterSpacing: 0,
            textShadow: "0 2px 2px #000",
            ...(type === "password"
              ? ({ WebkitTextSecurity: "disc" } as CSSProperties & { WebkitTextSecurity: string })
              : {}),
          }}
        />
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            right: 12,
            top: "50%",
            transform: "translateY(-50%)",
            width: 28,
            height: 28,
            borderRadius: 4,
            background: "rgba(170,174,180,0.72)",
            color: "#f6f6f6",
            fontSize: 18,
            letterSpacing: 2,
            lineHeight: "24px",
            textAlign: "center",
          }}
        >
          ···
        </span>
      </div>
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
        width: "13.8%",
        minWidth: 180,
        height: "5.6%",
        minHeight: 48,
        padding: 2,
        border: 0,
        background: "linear-gradient(180deg, #e0ded2 0%, #766f5b 44%, #eee9da 50%, #5c523e 100%)",
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
            ? "linear-gradient(180deg,#211d15,#13100b 58%,#2a2318)"
            : hover
              ? "linear-gradient(180deg,#56513f,#1f1b12 58%,#3d3424)"
              : "linear-gradient(180deg,#4a4638,#17130d 58%,#332b1e)",
          color: "#ddd2bc",
          fontFamily: "Tahoma, Geneva, sans-serif",
          fontSize: "clamp(22px, 1.6vw, 32px)",
          letterSpacing: 0,
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
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        width: "100vw",
        height: "100vh",
        background: "#000",
        overflow: "hidden",
        fontFamily: "Tahoma, Geneva, sans-serif",
      }}
    >
      <video
        src={loginVideo.url}
        autoPlay
        muted
        loop
        playsInline
        poster={loginPoster.url}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: "100vw",
          height: "100vh",
          objectFit: "cover",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at center, rgba(255,255,255,0.02), rgba(0,0,0,0.12) 72%, rgba(0,0,0,0.34) 100%)",
        }}
      />
      <div style={{ position: "absolute", left: 0, top: 0, width: "100vw", height: "100vh" }}>
        <div
          style={{
            position: "absolute",
            left: "50vw",
            top: "38.3vh",
            transform: "translateX(-50%)",
            width: "100vw",
            height: "4.1%",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <LoginField value={id} onChange={setId} onEnter={submit} />
        </div>
        <div
          style={{
            position: "absolute",
            left: "50vw",
            top: "43.6vh",
            transform: "translateX(-50%)",
            width: "100vw",
            height: "4.1%",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <LoginField
            value={pw}
            onChange={setPw}
            type="password"
            placeholder="Password"
            onEnter={submit}
          />
        </div>
        <div
          style={{
            position: "absolute",
            left: "50vw",
            top: "51vh",
            transform: "translateX(-50%)",
            width: "100vw",
            display: "flex",
            justifyContent: "center",
            gap: "2.45%",
          }}
        >
          <LoginButton onClick={submit} disabled={busy || !id.trim()}>
            {busy ? "…" : "Log In"}
          </LoginButton>
          <LoginButton>Exit</LoginButton>
        </div>
        {error ? (
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "58.5%",
              transform: "translateX(-50%)",
              maxWidth: 520,
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
