/**
 * S13 — NpcHtml(0x19) queue.
 *
 * The server can push HTML dialogs before any HTML window is ready (boot is
 * slow). Buffer them up to ~60s and retry whenever a renderer registers.
 */

export interface NpcHtmlMessage {
  npcObjectId: number;
  html: string;
  receivedAt: number;
}

type Renderer = (msg: NpcHtmlMessage) => void;

const HOLD_MS = 60_000;
const pending: NpcHtmlMessage[] = [];
let renderer: Renderer | null = null;

export function queueNpcHtml(msg: NpcHtmlMessage): void {
  if (renderer) {
    try {
      renderer(msg);
      return;
    } catch {
      /* fall through and queue */
    }
  }
  pending.push(msg);
  // Drop stale.
  const cutoff = Date.now() - HOLD_MS;
  while (pending.length && pending[0].receivedAt < cutoff) pending.shift();
}

export function registerNpcHtmlRenderer(fn: Renderer | null): void {
  renderer = fn;
  if (!fn) return;
  const cutoff = Date.now() - HOLD_MS;
  while (pending.length) {
    const msg = pending.shift()!;
    if (msg.receivedAt < cutoff) continue;
    try {
      fn(msg);
    } catch {
      /* keep draining */
    }
  }
}

export function clearNpcHtmlQueue(): void {
  pending.length = 0;
}
