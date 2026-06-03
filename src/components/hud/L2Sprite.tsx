/**
 * Authentic L2 UI primitives — render the REAL client sprites (extracted from
 * SysTextures/*.utx) so windows/buttons/frames look exactly like the Windows client.
 *
 * Wrap your app (or just /world) once:
 *   <SpriteProvider><L2HudAuthentic/></SpriteProvider>
 *
 * Then compose:
 *   <L2Frame style={{width:208,padding:6}}> ...status bars... </L2Frame>
 *   <L2Button onClick={...}>OK</L2Button>
 *   <L2Slot size={34}/>  <L2Checkbox checked/>  <L2Sprite refId="L2UI_CT1.Divider_DF"/>
 */
import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { loadSprites, buildRegistry, UI, NINE_SLICE, type SpriteRegistry } from "@/lib/l2-protocol/l2-ui-sprites";

const Ctx = createContext<SpriteRegistry | null>(null);
export const useSprites = () => useContext(Ctx);

/** Loads the sprite manifest once and provides it to all L2 UI primitives. */
export function SpriteProvider({ children, manifest }: { children: ReactNode; manifest?: Record<string, string | null> }) {
  const [reg, setReg] = useState<SpriteRegistry | null>(manifest ? buildRegistry(manifest) : null);
  useEffect(() => {
    if (reg) return;
    let alive = true;
    loadSprites().then((r) => { if (alive) setReg(r); });
    return () => { alive = false; };
  }, [reg]);
  return <Ctx.Provider value={reg}>{children}</Ctx.Provider>;
}

const px = (n: number | string) => (typeof n === "number" ? `${n}px` : n);

/** A single sprite as an <img>. Falls back to nothing if the sprite is missing. */
export function L2Sprite({ refId, width, height, style, alt }: { refId: string; width?: number | string; height?: number | string; style?: CSSProperties; alt?: string }) {
  const reg = useSprites();
  const url = reg?.url(refId);
  if (!url) return null;
  return <img src={url} width={width as number} height={height as number} alt={alt ?? ""} draggable={false} style={{ imageRendering: "auto", display: "block", ...style }} />;
}

/** 9-slice stretchable frame from a small border sprite (default GroupBox_DF). */
export function L2Frame({ refId = UI.frame, children, style, slice }: { refId?: string; children?: ReactNode; style?: CSSProperties; slice?: number }) {
  const reg = useSprites();
  const url = reg?.url(refId);
  const inset = slice ?? NINE_SLICE[refId] ?? 3;
  const base: CSSProperties = url
    ? { borderStyle: "solid", borderWidth: inset, borderImage: `url(${url}) ${inset} fill stretch`, position: "relative" }
    : { background: "linear-gradient(180deg,#1e1c18,#15130f)", border: "1px solid #4a4236", position: "relative" };
  return <div style={{ ...base, ...style }}>{children}</div>;
}

/** 3-state L2 button (idle / hover / press) using the real Button_DF sprites + a text label. */
export function L2Button({
  children, onClick, disabled, variant = "default", style, width, height = 24,
}: { children?: ReactNode; onClick?: () => void; disabled?: boolean; variant?: "default" | "large" | "small"; style?: CSSProperties; width?: number | string; height?: number }) {
  const reg = useSprites();
  const set = variant === "large" ? UI.buttonLarge : variant === "small" ? UI.buttonSmall : UI.button;
  const [st, setSt] = useState<"up" | "over" | "down">("up");
  const refId = disabled ? UI.button.disable : (set as Record<string, string>)[st] ?? set.up;
  const url = reg?.url(refId);
  const inset = NINE_SLICE[refId] ?? 6;
  const border: CSSProperties = url
    ? { borderStyle: "solid", borderWidth: inset, borderImage: `url(${url}) ${inset} fill stretch` }
    : { background: st === "down" ? "#2a2620" : "#3a342a", border: "1px solid #5a4a2a" };
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => !disabled && setSt("over")}
      onMouseLeave={() => !disabled && setSt("up")}
      onMouseDown={() => !disabled && setSt("down")}
      onMouseUp={() => !disabled && setSt("over")}
      style={{
        ...border, height, width, minWidth: 40, padding: "0 10px", cursor: disabled ? "default" : "pointer",
        color: disabled ? "#7a7058" : "#e6dcc0", fontFamily: "Tahoma, sans-serif", fontSize: 11, fontWeight: 700,
        textShadow: "0 1px 1px #000", lineHeight: 1, boxSizing: "border-box", ...style,
      }}
    >
      {children}
    </button>
  );
}

/** Item/shortcut slot background. */
export function L2Slot({ size = 34, refId = UI.itemSlot, children, style }: { size?: number; refId?: string; children?: ReactNode; style?: CSSProperties }) {
  const reg = useSprites();
  const url = reg?.url(refId);
  return (
    <div style={{ width: size, height: size, position: "relative", backgroundImage: url ? `url(${url})` : undefined, backgroundSize: "100% 100%", background: url ? undefined : "#161410", border: url ? undefined : "1px solid #3a342a", ...style }}>
      {children}
    </div>
  );
}

/** Authentic checkbox. */
export function L2Checkbox({ checked = false, onChange, size = 16 }: { checked?: boolean; onChange?: (v: boolean) => void; size?: number }) {
  const reg = useSprites();
  const url = reg?.url(checked ? UI.checkbox.on : UI.checkbox.off);
  return (
    <span onClick={() => onChange?.(!checked)} style={{ display: "inline-block", width: size, height: size, cursor: "pointer", backgroundImage: url ? `url(${url})` : undefined, backgroundSize: "100% 100%", border: url ? undefined : "1px solid #5a4a2a" }} />
  );
}

/** Window title-bar tab. */
export function L2Tab({ label, selected, onClick }: { label: string; selected?: boolean; onClick?: () => void }) {
  const reg = useSprites();
  const url = reg?.url(selected ? UI.tab.selected : UI.tab.bg);
  return (
    <div onClick={onClick} style={{ position: "relative", padding: "3px 12px", cursor: "pointer", fontSize: 11, color: selected ? "#f0e2b8" : "#b5a273", textShadow: "0 1px 1px #000", backgroundImage: url ? `url(${url})` : undefined, backgroundSize: "100% 100%" }}>
      {label}
    </div>
  );
}
