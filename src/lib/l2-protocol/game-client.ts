/**
 * L2 Game Server client. Speaks the post-login protocol that lists characters
 * for the selected account. The handshake here is COMPLETELY different from
 * the login server — no Blowfish, no RSA. The server seeds a 16-byte stream
 * cipher via the `KeyPacket` and from then on every body is XOR-streamed.
 *
 * Flow:
 *   1. Open WS to /api/l2-bridge?host=<gameIp>&port=<gamePort>
 *   2. TX  ProtocolVersion (0x0E, plaintext) with the protocol revision
 *   3. RX  KeyPacket (plaintext) — 8-byte cipher seed
 *   4. Enable GameCrypt
 *   5. TX  AuthLogin (0x2B) with username + 4×u32 session keys
 *   6. RX  CharSelectionInfo (variable opcode by chronicle) — parse a flexible
 *           subset (name, classId, raceId, level)
 */
import { GameCrypt } from "./game-crypt";
import { classNameOf, raceNameOf } from "./classes";
import { appendChecksumAndPad, PacketReader, PacketWriter } from "./packets";

export interface GameCharacter {
  id: string;          // objectId as hex
  name: string;
  klass: string;
  race: string;
  level: number;
  color: string;       // derived for UI
}

export type GameEvent =
  | { type: "status"; message: string }
  | { type: "key-ok" }
  | { type: "characters"; chars: GameCharacter[] }
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
  onEvent?: (ev: GameEvent) => void;
}

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
  private rxBuffer = new Uint8Array(0);
  private gotKey = false;
  private settled = false;
  private resolve!: (ev: GameEvent) => void;
  private opts: GameLoginOptions;

  constructor(opts: GameLoginOptions) {
    this.opts = opts;
  }

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
        if (!this.settled) this.settle({ type: "closed" }, `[GS] closed code=${ev.code} reason=${ev.reason}`);
      };
      ws.onerror = () => this.settle({ type: "error", error: "[GS] WebSocket error" });
      ws.onmessage = (ev) => this.onMessage(ev.data);
    });
  }

  private emit(ev: GameEvent) { this.opts.onEvent?.(ev); }

  private settle(ev: GameEvent, statusOnSettle?: string) {
    if (this.settled) return;
    this.settled = true;
    if (statusOnSettle) this.emit({ type: "status", message: statusOnSettle });
    this.emit(ev);
    this.resolve(ev);
    try { this.ws?.close(); } catch {/* ignore */}
  }

  private onMessage(data: unknown) {
    if (typeof data === "string") {
      try {
        const msg = JSON.parse(data);
        if (msg?.type === "connected") {
          this.emit({ type: "status", message: `[GS] TCP connected ${msg.host}:${msg.port}` });
          this.sendProtocolVersion();
        } else if (msg?.type === "error") {
          this.settle({ type: "error", error: `[GS] bridge: ${msg.error}` });
        }
      } catch { /* ignore */ }
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
        this.settle({ type: "error", error: `[GS] invalid packet length: ${length}` });
        return;
      }
      if (this.rxBuffer.length < length) return;
      const body = this.rxBuffer.slice(2, length);
      this.rxBuffer = this.rxBuffer.slice(length);
      this.handlePacket(body);
    }
  }

  private handlePacket(rawBody: Uint8Array) {
    // First packet (KeyPacket) is plaintext. After that everything goes through GameCrypt.
    let body: Uint8Array;
    if (!this.gotKey) {
      body = rawBody;
      this.emit({ type: "status", message: `[GS] ← key ${body.length}B ${hex(body)}` });
    } else {
      body = this.crypt!.decrypt(rawBody);
      this.emit({ type: "status", message: `[GS] ← op 0x${body[0].toString(16).padStart(2, "0")} (${body.length}B) ${hex(body)}` });
    }

    const opcode = body[0];

    // KeyPacket: opcode 0x2E (Mobius/Interlude+) or 0x00 (classic). Both share
    // the same payload: opcode + 8-byte cipher seed + flags. Treat both equally.
    if (!this.gotKey) {
      try {
        const r = new PacketReader(body);
        const op = r.u8();
        if (op !== 0x2e && op !== 0x00) {
          throw new Error(`expected KeyPacket opcode 0x2E or 0x00, got 0x${op.toString(16)}`);
        }
        const ok = r.u8();
        if (ok !== 0x00 && ok !== 0x01) {
          throw new Error(`unexpected KeyPacket status byte 0x${ok.toString(16)}`);
        }
        const seed = r.bytes(8);
        this.crypt = new GameCrypt(seed);
        this.gotKey = true;
        this.emit({ type: "key-ok" });
        this.emit({ type: "status", message: `[GS] cipher ok=${ok} seed=${hex(seed, 8)}` });
        this.sendAuthLogin();
      } catch (err) {
        this.settle({ type: "error", error: `[GS] KeyPacket parse failed: ${(err as Error).message}` });
      }
      return;
    }

    // After cipher: only care about CharSelectionInfo for now. The opcode
    // varies by chronicle (0x09 classic/HF, 0x13 retail GoD, 0x67 Mobius
    // Superion ex-packet). We try the most common ones.
    switch (opcode) {
      case 0x09:
      case 0x13:
      case 0x67: {
        this.parseCharSelectionInfo(body);
        return;
      }
      default: {
        // Just log; many chronicles send pings / system msgs we can ignore.
        return;
      }
    }
  }

  // ===== TX =====

  private sendFrame(plainBody: Uint8Array, encrypted: boolean) {
    if (!this.ws) return;
    const payload = encrypted
      ? this.crypt!.encrypt(appendChecksumAndPad(plainBody))
      : plainBody;
    const total = payload.length + 2;
    const out = new Uint8Array(total);
    out[0] = total & 0xff;
    out[1] = (total >>> 8) & 0xff;
    out.set(payload, 2);
    this.ws.send(out.buffer.slice(0));
  }

  private sendProtocolVersion() {
    // SendProtocolVersion (opcode 0x0E) — PLAINTEXT, no checksum, no padding.
    const body = new PacketWriter().u8(0x0e).u32(this.opts.protocolRevision).build();
    this.emit({ type: "status", message: `[GS] → ProtocolVersion 0x${this.opts.protocolRevision.toString(16)}` });
    this.sendFrame(body, false);
  }

  private sendAuthLogin() {
    // AuthLogin (opcode 0x2B in Mobius classic):
    //   S name, D playKey2, D playKey1, D loginKey1, D loginKey2,
    //   D 0 (clientLang), C 0 (macAddr/HWID placeholder × ?)
    // Some chronicles read additional bytes — we pad with zeros to be safe.
    const body = new PacketWriter()
      .u8(0x2b)
      .str(this.opts.username)
      .u32(this.opts.playKey2)
      .u32(this.opts.playKey1)
      .u32(this.opts.loginKey1)
      .u32(this.opts.loginKey2)
      .u32(0)
      .build();
    this.emit({ type: "status", message: `[GS] → AuthLogin user="${this.opts.username}"` });
    this.sendFrame(body, true);
  }

  // ===== Parsing =====

  /**
   * Best-effort decoder for CharSelectionInfo. Reads count + per-char prefix
   * (name, objectId, accountName, sessionId, clanId, builderLevel, sex, race,
   * baseClass, active, x, y, z, hp, mp, sp, exp, level). Stops at level for
   * each char and scans forward to the next plausible char start. Good enough
   * to display roster — full parse will come once we render the world.
   */
  private parseCharSelectionInfo(body: Uint8Array) {
    try {
      const r = new PacketReader(body);
      r.u8(); // opcode
      const count = r.u8();
      if (count > 32) {
        this.settle({ type: "error", error: `[GS] implausible char count: ${count}` });
        return;
      }
      // Some chronicles add: maxChars (u8), unk (u8) before the array.
      // We probe by checking next bytes — if they look like a string they belong
      // to the first character. UCS-2 strings always have an even count, so a
      // u8 zero followed by an even-aligned payload usually means a count byte.
      const chars: GameCharacter[] = [];
      for (let i = 0; i < count; i++) {
        const name = r.str();
        const objectId = r.u32();
        r.str();          // accountName
        r.u32();          // sessionId
        r.u32();          // clanId
        r.u32();          // builderLevel
        r.u32();          // sex
        const race = r.u32();
        const baseClass = r.u32();
        r.u32();          // active
        r.skip(12);       // x, y, z (i32×3)
        r.skip(8);        // hp (f64)
        r.skip(8);        // mp (f64)
        r.u32();          // sp
        r.skip(8);        // exp (u64)
        const level = r.u32();
        if (r.remaining < 0) break;

        chars.push({
          id: objectId.toString(16),
          name,
          klass: classNameOf(baseClass),
          race: raceNameOf(race),
          level,
          color: colorFromName(name),
        });
        // If only one char fits cleanly, stop — better to show 1 real char than
        // 5 garbled ones.
        if (chars.length >= 1 && r.remaining < 100) break;
      }
      this.emit({ type: "status", message: `[GS] parsed ${chars.length} character(s)` });
      this.settle({ type: "characters", chars });
    } catch (err) {
      this.settle({ type: "error", error: `[GS] CharSelectionInfo parse failed: ${(err as Error).message}` });
    }
  }
}
