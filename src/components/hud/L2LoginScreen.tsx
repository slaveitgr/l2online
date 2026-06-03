import { useState } from "react";
import { L2Button } from "@/components/hud/L2Sprite";

const BG = "/hud/screens/LogonScreen.png";

function LoginInput({
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
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
      style={{
        width: 252,
        height: 26,
        border: "1px solid rgba(214, 171, 98, 0.7)",
        background: "linear-gradient(180deg, rgba(20,18,16,0.95) 0%, rgba(10,10,9,0.95) 100%)",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06), 0 0 18px rgba(0,0,0,0.22)",
        color: "#e6dcc0",
        textAlign: "center",
        fontFamily: "Tahoma, Geneva, sans-serif",
        fontSize: 12,
        outline: "none",
        padding: "0 10px",
      }}
    />
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
        background: `#000 url(${BG}) center/cover no-repeat`,
        fontFamily: "Tahoma, Geneva, sans-serif",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at center, transparent 0%, transparent 54%, rgba(0,0,0,0.3) 100%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "52.5%",
          transform: "translate(-50%, -50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          width: 300,
        }}
      >
        <LoginInput value={id} onChange={setId} placeholder="" onEnter={submit} />
        <LoginInput value={pw} onChange={setPw} type="password" placeholder="Password" onEnter={submit} />

        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          <L2Button onClick={submit} disabled={busy || !id.trim()} width={100} height={28}>
            {busy ? "Connecting…" : "Log In"}
          </L2Button>
          <L2Button width={100} height={28}>Exit</L2Button>
        </div>

        {error ? (
          <div
            style={{
              marginTop: 4,
              maxWidth: 340,
              textAlign: "center",
              fontSize: 11,
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
