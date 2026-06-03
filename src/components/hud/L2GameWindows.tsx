/**
 * In-game L2 windows rebuilt from the live Superion client:
 *   - L2SettingsWindow  (Video/Audio/… tabs + Basic/Advanced/Misc settings)
 *   - L2CalendarWindow  (daily login reward 4×7 grid)
 *   - L2ExitDialog      (Play Report + Exit / Cancel)
 * All use the repo's draggable HudWindow shell + l2-hud theme.
 */
import { useState, type CSSProperties } from "react";
import { HudWindow } from "./HudWindow";

const gold = "#d8b25a";
const labelCol = "#bcae84";

/* ─────────────────────────── Settings ─────────────────────────── */
const SETTINGS_TABS = ["Video", "Audio", "Configuration", "Gameplay", "UI", "Combat Text", "Chat Channel", "Chat Settings", "Key Bindings"];

function Slider({ label, value, leftCap, rightCap }: { label: string; value: number; leftCap: string; rightCap: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: "#d6c79a", marginBottom: 4 }}>{label}</div>
      <div style={{ position: "relative", height: 6, background: "#0a0a08", border: "1px solid #3a3222", borderRadius: 3 }}>
        <div style={{ position: "absolute", left: `${value * 100}%`, top: -3, width: 10, height: 12, marginLeft: -5, background: "linear-gradient(180deg,#e8c84a,#9a7020)", border: "1px solid #6a5420", borderRadius: 2 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#8a8270", marginTop: 2 }}><span>{leftCap}</span><span>{rightCap}</span></div>
    </div>
  );
}
function Check({ label, checked }: { label: string; checked?: boolean }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#cabf98", cursor: "pointer" }}>
      <span style={{ width: 13, height: 13, border: "1px solid #6a5a3a", background: checked ? gold : "#0a0a08", display: "inline-block" }} />{label}
    </label>
  );
}

export function L2SettingsWindow({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState("Video");
  return (
    <HudWindow title="Settings" initial={{ x: 360, y: 90 }} width={620} onClose={onClose}>
      <div style={{ display: "flex", gap: 8, minHeight: 380 }}>
        {/* tabs */}
        <div style={{ width: 120, display: "flex", flexDirection: "column", gap: 1, borderRight: "1px solid #3a3222", paddingRight: 6 }}>
          {SETTINGS_TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{ textAlign: "left", padding: "6px 8px", fontSize: 11, background: tab === t ? "linear-gradient(90deg,#3a2e16,#241a0c)" : "transparent", border: "none", borderLeft: `2px solid ${tab === t ? gold : "transparent"}`, color: tab === t ? gold : "#aaa085", cursor: "pointer" }}>{t}</button>
          ))}
        </div>
        {/* content */}
        <div style={{ flex: 1, fontSize: 11, color: "#cabf98" }}>
          <div style={{ color: gold, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Basic Settings</div>
          <div style={{ display: "flex", gap: 18 }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: "#9a9075", marginBottom: 6 }}>Display</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <div style={{ width: 60, height: 42, border: `2px solid ${gold}`, background: "#0c0c0a" }} />
                <div style={{ width: 60, height: 42, border: "1px solid #4a4030", background: "#0c0c0a" }} />
              </div>
              <div style={{ marginBottom: 6 }}>Resolution</div>
              <div style={{ height: 22, border: "1px solid #4a4030", background: "#0a0a08", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px" }}><span>1920 × 1080</span><span style={{ color: gold }}>▾</span></div>
            </div>
            <div style={{ flex: 1 }}>
              <Slider label="Brightness" value={0.5} leftCap="Very Dark" rightCap="Very Bright" />
              <Slider label="Characters" value={0.7} leftCap="Very Close" rightCap="Very Far" />
              <Slider label="PC/NPC Display Limit" value={0.6} leftCap="Min" rightCap="Max" />
            </div>
          </div>
          <div style={{ color: gold, fontSize: 13, fontWeight: 700, margin: "14px 0 8px" }}>Advanced Settings</div>
          <Slider label="Graphics Quality" value={0.75} leftCap="Low" rightCap="High" />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button style={pill}>＋ Show Detailed Settings</button>
            <Check label="Lower Detail" />
          </div>
          <div style={{ color: gold, fontSize: 13, fontWeight: 700, margin: "14px 0 8px" }}>Misc. Settings</div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span>Cloak</span><div style={{ width: 120, height: 22, border: "1px solid #4a4030", background: "#0a0a08", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px" }}><span>All Cloaks</span><span style={{ color: gold }}>▾</span></div></div>
            <Check label="Optimize Performance" checked />
          </div>
        </div>
      </div>
      {/* footer */}
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 10, borderTop: "1px solid #3a3222", paddingTop: 8 }}>
        <button style={pill}>Reset UI</button>
        <button style={pill}>Reset to Default</button>
        <span style={{ flex: 1 }} />
        <button style={pillGold} onClick={onClose}>Apply and close</button>
        <button style={pill}>Apply</button>
        <button style={pill} onClick={onClose}>Cancel</button>
      </div>
    </HudWindow>
  );
}

/* ─────────────────────────── Calendar ─────────────────────────── */
export function L2CalendarWindow({ onClose }: { onClose: () => void }) {
  const days = Array.from({ length: 28 }, (_, i) => i + 1);
  return (
    <HudWindow title="Calendar" initial={{ x: 420, y: 70 }} width={640} onClose={onClose}>
      <div style={{ textAlign: "center", fontSize: 11, color: "#cabf98", lineHeight: 1.6 }}>
        Log in to Lineage 2 every day to get special gifts!<br />
        <span style={{ color: "#8a8270" }}>(The attendance will be counted in 5 min. after logging in. The timer resets daily at 06:30.)</span><br />
        <span style={{ color: gold }}>(Given once per account)</span>
      </div>
      <div style={{ textAlign: "center", fontSize: 10, color: "#9a9075", margin: "8px 0" }}>Event duration : 2026-06-01 ~ 2026-07-05 End Date</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {days.map((d) => {
          const claimable = d === 1;
          return (
            <div key={d} style={{ position: "relative", aspectRatio: "1", background: "linear-gradient(180deg,#1a160e,#0e0b07)", border: `1px solid ${claimable ? gold : "#3a3222"}`, padding: 4 }}>
              <span style={{ position: "absolute", top: 2, left: 4, fontSize: 9, color: "#9a9075" }}>{String(d).padStart(2, "0")}</span>
              <div style={{ width: "100%", height: 34, marginTop: 12, background: "radial-gradient(circle,#3a2e16,#15110a)", border: "1px solid #4a4030", display: "flex", alignItems: "center", justifyContent: "center", color: gold, fontSize: 14 }}>✦</div>
              <div style={{ textAlign: "center", fontSize: 8, color: "#cabf98", marginTop: 1 }}>x{d % 3 === 0 ? 500 : 1}</div>
              <div style={{ textAlign: "center", fontSize: 9, color: claimable ? "#7ad84a" : "#6a6050" }}>{claimable ? "29:44" : "🔒"}</div>
            </div>
          );
        })}
      </div>
    </HudWindow>
  );
}

/* ─────────────────────────── Exit dialog ─────────────────────────── */
export function L2ExitDialog({ onExit, onCancel }: { onExit: () => void; onCancel: () => void }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-auto z-[60]" style={{ background: "rgba(0,0,0,0.35)" }}>
      <div className="l2-hud-frame" style={{ width: 240 }}>
        <div className="l2-hud-title"><span>Exit</span><button className="l2-hud-close" onClick={onCancel}>×</button></div>
        <div style={{ padding: "14px 16px", textAlign: "center", color: "#cabf98", fontSize: 11 }}>
          <div style={{ color: gold, fontWeight: 700, marginBottom: 10 }}>Play Report</div>
          {[["XP", "0 XP"], ["Adena", "0 adena"], ["Items Acquired", "0 pc(s)."], ["Total play time", "0 d. 0 h. 1 min."]].map(([k, v]) => (
            <div key={k} style={{ margin: "6px 0" }}><div style={{ color: labelCol }}>{k}</div><div style={{ color: "#e6dcc0" }}>{v}</div></div>
          ))}
          <button style={{ ...pill, width: "100%", marginTop: 8 }}>Reset</button>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
            <button style={{ ...pillGold, width: "100%" }} onClick={onExit}>⏻ Exit</button>
            <button style={{ ...pill, width: "100%" }} onClick={onCancel}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const pill: CSSProperties = { height: 24, padding: "0 12px", background: "rgba(8,8,8,0.7)", border: "1px solid #5a4a2a", color: "#ecdfb8", fontSize: 11, fontWeight: 700, cursor: "pointer" };
const pillGold: CSSProperties = { ...pill, background: "linear-gradient(180deg,#4a3c1e,#241a0c)", borderColor: "#7c6a3e" };
