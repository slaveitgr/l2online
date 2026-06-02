/**
 * L2 Game Server client — Mobius 12.3 "Superion", protocol 502.
 *
 * Handles the post-login pipeline AND the enter-world handshake:
 *
 *   ProtocolVersion(0x0E) → KeyPacket(0x2E) → AuthLogin(0x2B)
 *     → CharSelectionInfo(0x09)            [roster]
 *     → CharacterSelect(0x12) → CharSelected(0x0B)
 *     → EnterWorld(0x11)                   [spawn handshake]
 *     → … world packets (UserInfo etc.)   [logged, not yet parsed]
 *
 * Encryption gate: KeyPacket carries a PACKET_ENCRYPTION int after the seed.
 * slave.gr runs it = 0, so the whole stream is PLAINTEXT. We honour the flag.
 *
 * This client now KEEPS THE SOCKET OPEN after the roster so the same TCP
 * connection can select a character and enter the world. Use the module
 * singleton (getGameConnection / setGameConnection) to carry it across routes.
 */
import { GameCrypt } from "./game-crypt";
import { classNameOf, raceNameOf } from "./classes";
import { PacketReader, PacketWriter } from "./packets";

export interface GameCharacter {
  id: string; // objectId as hex
  name: string;
  klass: string;
  race: string;
  level: number;
  color: string; // derived for UI
}

export type GameEvent =
  | { type: "status"; message: string }
  | { type: "key-ok" }
  | { type: "characters"; chars: GameCharacter[] }
  | { type: "char-selected"; name: string; objectId: number; x: number; y: number; z: number }
  | { type: "in-world"; message: string }
  | { type: "world-packet"; opcode: number; length: number }
  | { type: "error"; error: string }
  | { type: "closed" };

export interface GameLoginOptions {
  host: string;
  port: number;
  username: string;
  protocolRevision: number;
  loginKey1: number;
  loginKey2: number;
  playKey1: number;
  playKey2: number;
  bridgeUrl?: string;
  /** Keep the TCP socket open after the roster (needed to enter world). */
  keepAlive?: boolean;
  onEvent?: (ev: GameEvent) => void;
}

// CharSelectionInfo per-char "tail": bytes from the end of `level` to the end
// of one character's block. Constant per server build (only name/accountName
// vary, and those are read explicitly). 12.3 source = 519; slave.gr = 495.
//   tail = bodyLen - 17(header) - 122(prefix incl strings up to level)
const CHAR_TAIL_AFTER_LEVEL = 495;

type Phase = "auth" | "roster" | "selecting" | "entering" | "in-world";

function hex(b: Uint8Array, max = 32): string {
  const n = Math.min(b.length, max);
  let s = "";
  for (let i = 0; i < n; i++) s += (i ? " " : "") + b[i].toString(16).padStart(2, "0");
  if (b.length > max) s += ` …(+${b.length - max})`;
  return s;
}

function colorFromName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  const hue = ((h % 360) + 360) % 360;
  return `oklch(0.55 0.15 ${hue})`;
}

export class L2GameClient {
  private ws: WebSocket | null = null;
  private crypt: GameCrypt | null = null;
  private useEncryption = false;
  private rxBuffer = new Uint8Array(0);
  private gotKey = false;
  private phase: Phase = "auth";
  private resolved = false; // start() promise resolved
  private resolve!: (ev: GameEvent) => void;
  private opts: GameLoginOptions;
  private authTimer: ReturnType<typeof setTimeout> | null = null;
  private chars: GameCharacter[] = [];

  constructor(opts: GameLoginOptions) {
    this.opts = opts;
  }

  // ===== lifecycle =====

  start(): Promise<GameEvent> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      const proto = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";
      const base = this.opts.bridgeUrl ?? `${proto}//${window.location.host}/api/l2-bridge`;
      const url = `${base}?host=${encodeURIComponent(this.opts.host)}&port=${this.opts.port}`;
      this.emit({ type: "status", message: `[GS] connecting bridge ${url}` });
      const ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";
      this.ws = ws;
      ws.onopen = () => this.emit({ type: "status", message: "[GS] WebSocket open" });
      ws.onclose = (ev) => {
        if (!this.resolved) this.finish({ type: "closed" }, `[GS] closed code=${ev.code} reason=${ev.reason}`);
        else this.emit({ type: "status", message: `[GS] socket closed (${ev.code})` });
      };
      ws.onerror = () => {
        if (!this.resolved) this.finish({ type: "error", error: "[GS] WebSocket error" });
      };
      ws.onmessage = (ev) => this.onMessage(ev.data);
    });
  }

  /** Disconnect explicitly (e.g. when leaving the world). */
  disconnect() {
    if (this.authTimer) clearTimeout(this.authTimer);
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
  }

  get characters(): GameCharacter[] {
    return this.chars;
  }
  get connected(): boolean {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  /** Re-point the event handler (e.g. when a new route mounts). */
  setEventHandler(cb: (ev: GameEvent) => void) {
    this.opts.onEvent = cb;
  }

  private emit(ev: GameEvent) {
    this.opts.onEvent?.(ev);
  }

  /** Resolve the start() promise (once). Does NOT close the socket. */
  private resolveOnce(ev: GameEvent) {
    if (this.resolved) return;
    this.resolved = true;
    this.resolve(ev);
  }

  /** Terminal failure: resolve (if pending) AND close the socket. */
  private finish(ev: GameEvent, statusOnSettle?: string) {
    if (statusOnSettle) this.emit({ type: "status", message: statusOnSettle });
    this.emit(ev);
    this.resolveOnce(ev);
    this.disconnect();
  }

  // ===== RX =====

  private onMessage(data: unknown) {
    if (typeof data === "string") {
      try {
        const msg = JSON.parse(data);
        if (msg?.type === "connected") {
          this.emit({ type: "status", message: `[GS] TCP connected ${msg.host}:${msg.port}` });
          this.sendProtocolVersion();
        } else if (msg?.type === "error") {
          this.finish({ type: "error", error: `[GS] bridge: ${msg.error}` });
        }
      } catch {
        /* ignore */
      }
      return;
    }
    if (!(data instanceof ArrayBuffer)) return;
    const bytes = new Uint8Array(data);
    const merged = new Uint8Array(this.rxBuffer.length + bytes.length);
    merged.set(this.rxBuffer);
    merged.set(bytes, this.rxBuffer.length);
    this.rxBuffer = merged;
    this.drain();
  }

  private drain() {
    while (this.rxBuffer.length >= 2) {
      const length = this.rxBuffer[0] | (this.rxBuffer[1] << 8);
      if (length < 2 || length > 0x10000) {
        this.finish({ type: "error", error: `[GS] invalid packet length: ${length}` });
        return;
      }
      if (this.rxBuffer.length < length) return;
      const body = this.rxBuffer.slice(2, length);
      this.rxBuffer = this.rxBuffer.slice(length);
      this.handlePacket(body);
    }
  }

  private handlePacket(rawBody: Uint8Array) {
    if (!this.gotKey) {
      this.handleKeyPacket(rawBody);
      return;
    }
    const body = this.useEncryption && this.crypt ? this.crypt.decrypt(rawBody) : rawBody;
    const opcode = body[0];

    // Once in the world, just log everything — full world-state parsing is a
    // later milestone (UserInfo, NpcInfo, etc.).
    if (this.phase === "entering" || this.phase === "in-world") {
      if (this.phase === "entering") {
        this.phase = "in-world";
        this.emit({ type: "in-world", message: "[GS] EnterWorld accepted — receiving world state" });
      }
      this.emit({ type: "world-packet", opcode, length: body.length });
      this.emit({
        type: "status",
        message: `[GS] (world) ← op 0x${opcode.toString(16).padStart(2, "0")} (${body.length}B)`,
      });
      return;
    }

    this.emit({
      type: "status",
      message: `[GS] ← op 0x${opcode.toString(16).padStart(2, "0")} (${body.length}B) ${hex(body)}`,
    });

    if (opcode === 0x09 && this.phase !== "selecting") {
      // CharSelectionInfo (roster)
      if (this.authTimer) {
        clearTimeout(this.authTimer);
        this.authTimer = null;
      }
      this.parseCharSelectionInfo(body);
      return;
    }

    if (opcode === 0x0b && this.phase === "selecting") {
      // CharSelected → proceed to EnterWorld
      this.parseCharSelected(body);
      this.sendEnterWorld();
      return;
    }
    // else: ignore (system messages, ExSendManorList 0x0A, etc.)
  }

  private handleKeyPacket(body: Uint8Array) {
    try {
      const op = body[0];
      if (op !== 0x2e && op !== 0x00) {
        throw new Error(`expected KeyPacket opcode 0x2E or 0x00, got 0x${op.toString(16)}`);
      }
      let seedOffset = 1;
      let result = 1;
      if (op === 0x2e) {
        result = body[1];
        seedOffset = 2;
      }
      if (result !== 1) {
        throw new Error(`server rejected protocol ${this.opts.protocolRevision} (result=${result}); expected 502`);
      }
      if (body.length < seedOffset + 8) throw new Error(`KeyPacket too short: ${body.length}B`);

      const seed = body.slice(seedOffset, seedOffset + 8);
      const encOff = seedOffset + 8;
      let useEncryption = false;
      if (body.length >= encOff + 4) {
        const flag =
          (body[encOff] | (body[encOff + 1] << 8) | (body[encOff + 2] << 16) | (body[encOff + 3] << 24)) >>> 0;
        useEncryption = flag !== 0;
      }

      this.useEncryption = useEncryption;
      this.crypt = useEncryption ? new GameCrypt(seed) : null;
      this.gotKey = true;

      this.emit({ type: "key-ok" });
      this.emit({
        type: "status",
        message: `[GS] encryption=${useEncryption ? "ON" : "OFF"} seed=${hex(seed, 8)}`,
      });

      this.sendAuthLogin();

      this.authTimer = setTimeout(() => {
        this.finish({
          type: "error",
          error:
            "[GS] AuthLogin accepted but no CharSelectionInfo within 8s — likely GS↔LS " +
            "session validation or account already in use. Restart servers / wait, try once.",
        });
      }, 8000);
    } catch (err) {
      this.finish({ type: "error", error: `[GS] KeyPacket: ${(err as Error).message}` });
    }
  }

  // ===== TX =====

  private sendFrame(plainBody: Uint8Array, encrypt: boolean) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const payload = encrypt && this.crypt ? this.crypt.encrypt(plainBody) : plainBody;
    const total = payload.length + 2;
    const out = new Uint8Array(total);
    out[0] = total & 0xff;
    out[1] = (total >>> 8) & 0xff;
    out.set(payload, 2);
    this.ws.send(out.buffer.slice(0));
  }

  private sendProtocolVersion() {
    const body = new PacketWriter().u8(0x0e).u32(this.opts.protocolRevision).build();
    this.emit({
      type: "status",
      message: `[GS] → ProtocolVersion 0x${this.opts.protocolRevision.toString(16)}`,
    });
    this.sendFrame(body, false);
  }

  private sendAuthLogin() {
    const body = new PacketWriter()
      .u8(0x2b)
      .str(this.opts.username)
      .u32(this.opts.playKey2)
      .u32(this.opts.playKey1)
      .u32(this.opts.loginKey1)
      .u32(this.opts.loginKey2)
      .build();
    this.emit({
      type: "status",
      message: `[GS] → AuthLogin user="${this.opts.username}" (${this.useEncryption ? "enc" : "plain"})`,
    });
    this.sendFrame(body, this.useEncryption);
  }

  /**
   * Select a character by roster slot (0-based) and enter the world.
   * Must be called after start() resolved with { type: "characters" }.
   */
  selectCharacter(slot: number) {
    if (!this.connected) {
      this.emit({ type: "error", error: "[GS] not connected — cannot select character" });
      return;
    }
    this.phase = "selecting";
    // CharacterSelect (0x12): int charSlot, short, int, int, int
    const body = new PacketWriter().u8(0x12).u32(slot).u16(0).u32(0).u32(0).u32(0).build();
    this.emit({ type: "status", message: `[GS] → CharacterSelect slot=${slot}` });
    this.sendFrame(body, this.useEncryption);
  }

  private sendEnterWorld() {
    this.phase = "entering";
    // EnterWorld (0x11): 5×4 tracert bytes + 4 ints + 64-byte blob + 1 int.
    // The server reads but does not validate the contents → all zeros is fine.
    const body = new PacketWriter().u8(0x11).bytes(new Uint8Array(104)).build();
    this.emit({ type: "status", message: "[GS] → EnterWorld" });
    this.sendFrame(body, this.useEncryption);
  }

  // ===== Parsing =====

  private parseCharSelectionInfo(body: Uint8Array) {
    try {
      const r = new PacketReader(body);
      r.u8(); // opcode 0x09
      const count = r.u32();
      if (count > 32) {
        this.finish({ type: "error", error: `[GS] implausible char count: ${count}` });
        return;
      }
      r.skip(12); // header: maxChars(4)+byte+byte+int(4)+byte+byte

      const chars: GameCharacter[] = [];
      for (let i = 0; i < count; i++) {
        const name = r.str();
        const objectId = r.u32();
        r.str(); // accountName
        r.u32(); // sessionId
        r.u32(); // clanId
        r.u32(); // builderLevel
        r.u32(); // sex
        const race = r.u32();
        const baseClass = r.u32();
        r.u32(); // serverId
        r.skip(12); // x,y,z
        r.skip(8); // hp
        r.skip(8); // mp
        r.skip(8); // sp (long)
        r.skip(8); // exp (long)
        r.skip(8); // expPercent (double)
        const level = r.u32();

        chars.push({
          id: objectId.toString(16),
          name,
          klass: classNameOf(baseClass),
          race: raceNameOf(race),
          level,
          color: colorFromName(name),
        });

        if (i < count - 1) {
          r.skip(CHAR_TAIL_AFTER_LEVEL);
          if (r.remaining < 0) {
            this.emit({
              type: "status",
              message: `[GS] char #${i} tail overran — CHAR_TAIL_AFTER_LEVEL needs tuning`,
            });
            break;
          }
        }
      }

      this.chars = chars;
      this.phase = "roster";
      this.emit({ type: "status", message: `[GS] parsed ${chars.length} character(s)` });
      this.emit({ type: "characters", chars });
      this.resolveOnce({ type: "characters", chars });

      // If keepAlive is false, behave like before and close.
      if (!this.opts.keepAlive) this.disconnect();
    } catch (err) {
      this.finish({
        type: "error",
        error: `[GS] CharSelectionInfo parse failed: ${(err as Error).message}`,
      });
    }
  }

  private parseCharSelected(body: Uint8Array) {
    try {
      const r = new PacketReader(body);
      r.u8(); // opcode 0x0b
      const name = r.str();
      const objectId = r.u32();
      r.str(); // title
      r.u32(); // sessionId
      r.u32(); // clanId
      r.u32(); // 0
      r.u32(); // isFemale
      r.u32(); // race
      r.u32(); // classId
      r.u32(); // active
      const x = r.u32() | 0;
      const y = r.u32() | 0;
      const z = r.u32() | 0;
      this.emit({ type: "status", message: `[GS] CharSelected "${name}" @ ${x},${y},${z}` });
      this.emit({ type: "char-selected", name, objectId, x, y, z });
    } catch {
      // Non-fatal: we still send EnterWorld regardless.
      this.emit({ type: "status", message: "[GS] CharSelected received (unparsed)" });
    }
  }
}

// ===== Module singleton: carry the live connection across routes =====

let _activeGame: L2GameClient | null = null;
export function setGameConnection(c: L2GameClient | null) {
  _activeGame = c;
}
export function getGameConnection(): L2GameClient | null {
  return _activeGame;
}
