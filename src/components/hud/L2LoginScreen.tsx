/**
 * L2LoginScreen — pixel-faithful login dialog matching the real client:
 *   [ account input ]
 *   [ password     ]
 *   [ Log In ] [ Exit ]
 *
 * Renders centered over the looping login video; chrome (logos, side links)
 * comes from L2LauncherShell.
 */
import { useState, type CSSProperties, type ReactNode } from "react";
import { L2LauncherShell } from "./L2LauncherShell";

const textShadow = "0 1px 2px #000, 0 0 4px #000";

function L2Input({
  value,
  onChange,
  type = "text",
  placeholder,
  onEnter,
  name,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "password";
  placeholder?: string;
  onEnter?: () => void;
  name: string;
  autoFocus?: boolean;
}) {
  return (
    <div
      style={{
        position: "relative",
        width: 260,
        height: 26,
        marginBottom: 6,
        background:
          "linear-gradient(180deg,#1a1813 0%,#0a0907 55%,#1a1813 100%)",
        border: "1px solid #5a4a28",
        boxShadow: "inset 0 1px 0 rgba(255,235,180,0.08), 0 2px 4px rgba(0,0,0,0.7)",
      }}
    >
      <input
        suppressHydrationWarning
        type={type === "password" ? "password" : "text"}
        name={name}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        spellCheck={false}
        autoComplete="off"
        data-lpignore="true"
        data-1p-ignore="true"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        style={{
          width: "100%",
          height: "100%",
          border: 0,
          outline: 0,
          background: "transparent",
          color: "#e6dcb6",
          textAlign: "center",
          fontFamily: "Arial, Helvetica, sans-serif",
          fontSize: 13,
          textShadow,
          caretColor: "#e6ddbb",
        }}
      />
    </div>
  );
}

function L2DialogButton({
  children,
  onClick,
  disabled,
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 92,
        height: 26,
        background:
          "linear-gradient(180deg,#3a3424 0%,#1f1a10 55%,#2a2418 100%)",
        border: "1px solid #6a5630",
        boxShadow: "inset 0 1px 0 rgba(255,235,180,0.10), 0 2px 4px rgba(0,0,0,0.7)",
        color: disabled ? "#7a7058" : "#e6dcb6",
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: 12,
        letterSpacing: 0,
        textShadow,
        cursor: disabled ? "default" : "pointer",
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
  statusLog,
}: {
  onLogin?: (id: string, pw: string) => void;
  error?: string | null;
  busy?: boolean;
  statusLog?: string[];
}) {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");

  const submit = () => {
    if (!busy && id.trim()) onLogin?.(id.trim(), pw);
  };

  return (
    <L2LauncherShell logs={statusLog}>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "55%",
          transform: "translate(-50%, -50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          pointerEvents: "auto",
        }}
      >
        <L2Input
          name="l2_account"
          autoFocus
          value={id}
          onChange={setId}
          onEnter={submit}
          placeholder=""
        />
        <L2Input
          name="l2_secret"
          type="password"
          placeholder="Password"
          value={pw}
          onChange={setPw}
          onEnter={submit}
        />
        <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
          <L2DialogButton onClick={submit} disabled={busy || !id.trim()}>
            {busy ? "..." : "Log In"}
          </L2DialogButton>
          <L2DialogButton
            onClick={() => {
              if (typeof window !== "undefined") window.close();
            }}
          >
            Exit
          </L2DialogButton>
        </div>
        {error ? (
          <div
            style={{
              marginTop: 14,
              color: "#ff8c8c",
              fontSize: 12,
              textShadow,
              textAlign: "center",
              maxWidth: 360,
            }}
          >
            {error}
          </div>
        ) : null}
      </div>
    </L2LauncherShell>
  );
}

