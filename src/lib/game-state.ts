import { useSyncExternalStore } from "react";

/**
 * Tiny shared game-UI state. Lives outside React so the 3D viewport and the
 * desktop/mobile HUDs can read/write without prop drilling.
 *
 * Three concerns live here:
 *  - selected target  (red bracket / sticky)
 *  - hovered target   (cursor highlight, cleared on pointer-leave)
 *  - dialog target    (which NPC's talk panel is open, null = closed)
 */

let _targetId: number | null = null;
let _hoverId: number | null = null;
let _dialogId: number | null = null;

const _listeners = new Set<() => void>();

function emit() {
  for (const l of _listeners) {
    try { l(); } catch { /* ignore */ }
  }
}

function subscribe(cb: () => void) {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}

// ── selected target ─────────────────────────────────────────────────────
export function getSelectedTarget(): number | null { return _targetId; }
export function setSelectedTarget(id: number | null) {
  if (_targetId === id) return;
  _targetId = id;
  emit();
}
export function useSelectedTarget(): number | null {
  return useSyncExternalStore(subscribe, getSelectedTarget, () => null);
}

// ── hovered target ──────────────────────────────────────────────────────
export function getHoveredTarget(): number | null { return _hoverId; }
export function setHoveredTarget(id: number | null) {
  if (_hoverId === id) return;
  _hoverId = id;
  emit();
}
export function useHoveredTarget(): number | null {
  return useSyncExternalStore(subscribe, getHoveredTarget, () => null);
}

// ── dialog target (open NPC talk window) ────────────────────────────────
export function getDialogTarget(): number | null { return _dialogId; }
export function setDialogTarget(id: number | null) {
  if (_dialogId === id) return;
  _dialogId = id;
  emit();
}
export function useDialogTarget(): number | null {
  return useSyncExternalStore(subscribe, getDialogTarget, () => null);
}
