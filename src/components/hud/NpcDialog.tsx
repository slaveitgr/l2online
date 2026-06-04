import { useEffect, useState } from "react";
import { setDialogTarget, setSelectedTarget, useDialogTarget, useHoveredTarget, useSelectedTarget } from "@/lib/game-state";
import { npcMeshInfoSync, prettyNpcName } from "@/lib/npc-mesh";
import { getGameConnection, type WorldEntity } from "@/lib/l2-protocol/game-client";

/** Look up an entity by objectId from the live connection (cheap polled read). */
function findEntity(id: number | null): WorldEntity | null {
  if (id === null) return null;
  const conn = getGameConnection();
  if (!conn) return null;
  for (const e of conn.getEntities()) if (e.objectId === id) return e;
  return null;
}

function npcLabel(e: WorldEntity | null): string {
  if (!e) return "Target";
  if (e.isPlayer) return e.name ?? "Player";
  const info = npcMeshInfoSync(e.displayId);
  return prettyNpcName(info?.m, `NPC #${e.displayId}`);
}

/**
 * Floating "Press T to talk" hint that appears near the bottom-centre whenever
 * the player has an NPC selected (or hovered, on desktop). Pure presentation.
 */
export function NpcInteractPrompt() {
  const selected = useSelectedTarget();
  const hovered = useHoveredTarget();
  const dialog = useDialogTarget();
  const showId = dialog === null ? (selected ?? hovered) : null;
  const entity = findEntity(showId);
  if (showId === null || !entity || entity.isPlayer) return null;
  const name = npcLabel(entity);
  return (
    <div className="absolute left-1/2 -translate-x-1/2 bottom-[170px] pointer-events-none z-30">
      <div
        className="px-3 py-1.5 rounded font-mono text-[11px] tracking-wider"
        style={{
          background: "linear-gradient(180deg, rgba(8,10,14,0.92), rgba(16,12,8,0.88))",
          border: "1px solid hsl(var(--hud-line, 42 30% 28%))",
          color: "hsl(var(--hud-text, 48 35% 80%))",
          boxShadow: "0 6px 14px -8px rgba(0,0,0,0.7)",
        }}
      >
        <span style={{ color: "hsl(var(--hud-gold, 45 60% 55%))" }}>{name}</span>
        <span className="mx-2 opacity-50">·</span>
        Press <span style={{ color: "hsl(var(--hud-gold, 45 60% 55%))" }}>T</span> to talk
      </div>
    </div>
  );
}

interface NpcDialogProps {
  /** Optional callback to send chat / quest packets. */
  onSay?: (text: string) => void;
}

/**
 * NPC talk dialog. Opens when game-state's dialogTarget is non-null (T key, or
 * the mobile Interact button). Renders a small L2-style panel with the NPC's
 * name and the standard menu options (Talk / Quest / Trade / Cancel).
 *
 * Server-side dialog HTML is not wired here — this is the UI shell that the
 * existing `sendAction(objectId)` packet flow can hand off to later.
 */
export function NpcDialog({ onSay }: NpcDialogProps) {
  const dialogId = useDialogTarget();
  const entity = findEntity(dialogId);
  const [busy, setBusy] = useState(false);

  // Auto-close if the target despawns mid-conversation.
  useEffect(() => {
    if (dialogId === null) return;
    const t = setInterval(() => {
      if (!findEntity(dialogId)) setDialogTarget(null);
    }, 1000);
    return () => clearInterval(t);
  }, [dialogId]);

  if (dialogId === null || !entity) return null;
  const name = npcLabel(entity);

  const close = () => setDialogTarget(null);
  const dispatch = (label: string) => {
    setBusy(true);
    try {
      // Re-send Action so the server pushes its dialog HTML through the next
      // packet (we don't have the HTML renderer yet — chat fallback for now).
      const conn = getGameConnection();
      conn?.sendAction(entity.objectId);
      onSay?.(`[${name}] ${label}…`);
    } finally {
      setTimeout(() => setBusy(false), 200);
    }
  };

  return (
    <div className="absolute inset-0 z-40 pointer-events-none flex items-center justify-center">
      <div
        className="pointer-events-auto rounded font-mono w-[440px] max-w-[88vw]"
        style={{
          background: "linear-gradient(180deg, rgba(10,12,16,0.96), rgba(20,16,10,0.94))",
          border: "1px solid hsl(var(--hud-line, 42 30% 28%))",
          boxShadow: "0 18px 40px -16px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.04)",
          color: "hsl(var(--hud-text, 48 35% 82%))",
        }}
        role="dialog"
        aria-label={`Dialog with ${name}`}
      >
        {/* Title bar */}
        <div
          className="flex items-center justify-between px-3 py-2"
          style={{
            background: "linear-gradient(180deg, rgba(60,42,18,0.6), rgba(28,18,8,0.6))",
            borderBottom: "1px solid hsl(var(--hud-line, 42 30% 28%))",
          }}
        >
          <div className="text-[12px] tracking-wider" style={{ color: "hsl(var(--hud-gold, 45 60% 55%))" }}>
            ◆ {name}
          </div>
          <button
            onClick={close}
            className="text-[11px] px-2 leading-none opacity-70 hover:opacity-100"
            style={{ color: "hsl(var(--hud-text, 48 35% 82%))" }}
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 text-[12px] leading-relaxed">
          <p className="mb-3 opacity-90">
            Greetings, traveller. What brings you to me on this fine day?
          </p>
          <ul className="space-y-1.5">
            {[
              { key: "talk", label: "Talk" },
              { key: "quest", label: "Quest" },
              { key: "trade", label: "Trade / Shop" },
              { key: "teleport", label: "Teleport" },
            ].map((opt) => (
              <li key={opt.key}>
                <button
                  disabled={busy}
                  onClick={() => dispatch(opt.label)}
                  className="w-full text-left px-2 py-1 rounded hover:bg-white/5 transition disabled:opacity-50"
                  style={{ color: "hsl(var(--hud-gold, 45 60% 55%))" }}
                >
                  → <span className="underline underline-offset-2">{opt.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-3 py-2"
          style={{
            borderTop: "1px solid hsl(var(--hud-line, 42 30% 28%))",
            background: "rgba(0,0,0,0.25)",
          }}
        >
          <span className="text-[10px] opacity-50">ESC to close</span>
          <button
            onClick={() => {
              setSelectedTarget(null);
              close();
            }}
            className="text-[11px] px-3 py-1 rounded"
            style={{
              border: "1px solid hsl(var(--hud-line, 42 30% 28%))",
              background: "rgba(255,255,255,0.04)",
              color: "hsl(var(--hud-text, 48 35% 82%))",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
