import { useState, type CSSProperties } from "react";

const BG = "/hud/mock/login/login-bg-clean.jpg";
const VIDEO = "/hud/videos/login_web.mp4";

const fieldClip =
  "polygon(10px 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 10px 100%, 0 50%)";

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
          textShadow: "0 1px 1px #000, 0 0 3px #000",
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

function Button({
  children,
  onClick,
  disabled,
  style,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  style: CSSProperties;
}) {
  const [hover, setHover] = useState(false);
  const [down, setDown] = useState(false);
  return (
    <button
      type="button"
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
        position: "absolute",
        width: "5.45%",
        height: "3.13%",
        border: `1px solid ${hover ? "rgba(230,215,156,0.82)" : "rgba(204,196,151,0.62)"}`,
        borderRadius: 3,
        clipPath:
          "polygon(3px 0, calc(100% - 3px) 0, 100% 3px, 100% 100%, 0 100%, 0 3px)",
        background: hover
          ? "linear-gradient(to bottom, rgba(128,116,82,0.96), rgba(85,74,49,0.96) 44%, rgba(50,44,30,0.98))"
          : "linear-gradient(to bottom, rgba(107,98,74,0.94) 0%, rgba(72,66,49,0.94) 42%, rgba(43,39,30,0.98) 100%)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,225,0.24), inset 0 -1px 0 rgba(0,0,0,0.75), 0 2px 3px rgba(0,0,0,0.88)",
        color: hover ? "#fff" : "#e4dcc2",
        textShadow: "0 1px 2px #000",
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: "clamp(9px, 0.66vw, 13px)",
        lineHeight: "100%",
        padding: 0,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.55 : 1,
        transform: down ? "translateY(1px)" : undefined,
        filter: down ? "brightness(0.9)" : undefined,
        ...style,
      }}
    >
      {children}
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
          background: `#000 url(${BG}) center/cover no-repeat`,
        }}
      >
        <video
          src={VIDEO}
          autoPlay
          muted
          loop
          playsInline
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            pointerEvents: "none",
            zIndex: 1,
          }}
        />
        <div style={{ position: "absolute", inset: 0, zIndex: 2 }}>
          <Field
            name="l2_account"
            autoFocus
            value={id}
            onChange={setId}
            onEnter={submit}
            style={{ left: "42.98%", top: "52.62%" }}
          />
          <Field
            name="l2_secret"
            type="password"
            placeholder="Password"
            value={pw}
            onChange={setPw}
            onEnter={submit}
            style={{ left: "43.08%", top: "55.37%" }}
          />
          <Button
            onClick={submit}
            disabled={busy || !id.trim()}
            style={{ left: "44.25%", top: "58.55%" }}
          >
            {busy ? "…" : "Log In"}
          </Button>
          <Button style={{ left: "50.10%", top: "58.55%" }}>Exit</Button>
          {error ? (
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "63%",
                transform: "translateX(-50%)",
                color: "#ff8c8c",
                fontSize: 13,
                textShadow: "0 1px 2px #000",
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
