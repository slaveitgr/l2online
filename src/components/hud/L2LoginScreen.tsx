/**
 * Authentic L2 login screen — the real client LogonScreen art (LogBG.utx) with a
 * dark login panel (id / password / login) laid out like UIEasyLoginWnd.
 *
 *   <SpriteProvider>
 *     <L2LoginScreen onLogin={(id,pw)=>connectAuth(id,pw)} error={err} busy={connecting}/>
 *   </SpriteProvider>
 */
import { useState } from "react";
import { L2Frame, L2Button } from "@/components/hud/L2Sprite";

const BG = "/hud/screens/LogonScreen.png";

function Field({ label, value, onChange, type = "text", onEnter }: { label: string; value: string; onChange: (v: string) => void; type?: string; onEnter?: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", height: 26, gap: 10 }}>
      <span style={{ width: 86, fontSize: 11, color: "#cabf9a", textShadow: "0 1px 1px #000" }}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        style={{ flex: 1, height: 20, background: "#0a0a08", border: "1px solid #5a4e32", color: "#e6dcc0", fontFamily: "Tahoma, sans-serif", fontSize: 12, padding: "0 6px", outline: "none" }}
      />
    </div>
  );
}

export function L2LoginScreen({
  onLogin, error, busy, version = "The Chaotic Chronicle",
}: { onLogin?: (id: string, pw: string) => void; error?: string | null; busy?: boolean; version?: string }) {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const submit = () => { if (!busy && id) onLogin?.(id, pw); };

  return (
    <div style={{ position: "fixed", inset: 0, background: `#000 url(${BG}) center/cover no-repeat`, fontFamily: "Tahoma, Geneva, sans-serif", overflow: "hidden" }}>
      {/* subtle vignette so the panel reads over the art */}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.45) 100%)" }} />

      <L2Frame
        refId="L2UI_CT1.GroupBox_Black"
        style={{ position: "absolute", left: "50%", bottom: 56, transform: "translateX(-50%)", width: 320, padding: "14px 18px 16px", background: "rgba(6,7,9,0.62)" }}
      >
        <div style={{ textAlign: "center", letterSpacing: 4, fontSize: 15, fontWeight: 700, color: "#e6c87a", textShadow: "0 1px 2px #000", marginBottom: 12 }}>LOGIN</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Field label="Login Name" value={id} onChange={setId} onEnter={submit} />
          <Field label="Password" value={pw} onChange={setPw} type="password" onEnter={submit} />
        </div>
        {error && <div style={{ marginTop: 8, fontSize: 11, color: "#e06a6a", textAlign: "center", textShadow: "0 1px 1px #000" }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
          <L2Button onClick={submit} disabled={busy || !id} width={130} height={26}>{busy ? "Connecting…" : "Login"}</L2Button>
        </div>
        <div style={{ marginTop: 10, fontSize: 10, color: "#8a8270", textAlign: "center" }}>{version}</div>
      </L2Frame>
    </div>
  );
}
