import { useSyncExternalStore } from "react";

/**
 * Tiny shared game-UI state. Lives outside React so the 3D viewport and the
 * mobile HUD can read/write without prop drilling.
 */

let _targetId: number | null = null;
const _listeners = new Set<() => void>();

function emit() {
  for (const l of _listeners) {
    try {
      l();
    } catch {
      /* ignore */
    }
  }
}

export function getSelectedTarget(): number | null {
  return _targetId;
}

export function setSelectedTarget(id: number | null) {
  if (_targetId === id) return;
  _targetId = id;
  emit();
}

function subscribe(cb: () => void) {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}

export function useSelectedTarget(): number | null {
  return useSyncExternalStore(subscribe, getSelectedTarget, () => null);
}
