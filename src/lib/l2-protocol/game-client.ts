/**
 * L2 Game Server client — Mobius 12.3 "Superion", protocol 502.
 *
 * Post-login protocol that lists characters for the selected account.
 * COMPLETELY different from the login server — no Blowfish, no RSA. The server
 * seeds a 16-byte stream cipher via KeyPacket… *but only if it asks for it*.
 *
 * IMPORTANT (the fix): KeyPacket carries a `PACKET_ENCRYPTION` int right after
 * the 8-byte seed. If it is 0, the server neither encrypts nor decrypts — the
 * whole game stream is PLAINTEXT and we must send AuthLogin unencrypted too.
 * (slave.gr runs with PacketEncryption=false → that int is 0.)
 *
 * Flow:
 *   1. Open WS to /api/l2-bridge?host=<gameIp>&port=<gamePort>
 *   2. TX  ProtocolVersion (0x0E, plaintext) with revision 502
 *   3. RX  KeyPacket (0x2E, plaintext): result + 8-byte seed + PACKET_ENCRYPTION
 *   4. Enable GameCrypt ONLY if PACKET_ENCRYPTION != 0
 *   5. TX  AuthLogin (0x2B): username + 4×u32 session keys  (enc iff encryption on)
 *   6. RX  CharSelectionInfo (0x09) — parse roster
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

// CharSelectionInfo per-char "tail": the number of bytes from the end of the
// `level` field to the end of one character's block. Everything before `level`
// is read explicitly (incl. the two variable-length strings name/accountName),
// so this tail is CONSTANT across all characters for a given server build.
//
// The pure 12.3 Superion source produces 519 here, but slave.gr's build runs
// 24 bytes shorter (some version-gated "// 493" trailing fields are absent),
// so the real value is 495. Derived from the live packet:
//   tail = bodyLen - 17(header) - 122(prefix incl strings up to level)
//        = 634 - 17 - 122 = 495
// If you ever see "per-char layout mismatch" again, recompute from a fresh
// single-character CharSelectionInfo: tail = bodyLen - 17 - (122 with a
// 9-char name) and adjust for your actual name/account lengths.
const CHAR_TAIL_AFTER_LEVEL = 495;

export class L2GameClient {
  private ws: WebSocket | null = null;
  private crypt: GameCrypt | null = null;
  private useEncryption = false; // set from KeyPacket's PACKET_ENCRYPTION flag
  private rxBuffer = new Uint8Array(0);
  private gotKey = false;
  private settled = false;
  private resolve!: (ev: GameEvent) => void;
  private opts: GameLoginOptions;
  private authTimer: ReturnType<typeof setTimeout> | null = null;

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

  private emit(ev: GameEvent) {
    this.opts.onEvent?.(ev);
  }

  private settle(ev: GameEvent, statusOnSettle?: string) {
    if (this.settled) return;
    this.settled = true;
    if (this.authTimer) {
      clearTimeout(this.authTimer);
      this.authTimer = null;
    }
    if (statusOnSettle) this.emit({ type: "status", message: statusOnSettle });
    this.emit(ev);
    this.resolve(ev);
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
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
    // First packet (KeyPacket) is always plaintext. Afterwards it depends on
    // the PACKET_ENCRYPTION flag we read out of the KeyPacket.
    if (!this.gotKey) {
      this.handleKeyPacket(rawBody);
      return;
    }

    const body = this.useEncryption && this.crypt ? this.crypt.decrypt(rawBody) : rawBody;
    const opcode = body[0];
    this.emit({
      type: "status",
      message: `[GS] ← op 0x${opcode.toString(16).padStart(2, "0")} (${body.length}B) ${hex(body)}`,
    });

    // CharSelectionInfo on Mobius Superion is opcode 0x09 (confirmed in
    // ServerPackets.java: CHARACTER_SELECTION_INFO(0x09)).
    if (opcode === 0x09) {
      if (this.authTimer) {
        clearTimeout(this.authTimer);
        this.authTimer = null;
      }
      this.parseCharSelectionInfo(body);
      return;
    }
    // Anything else (system messages, pings) — ignore for now.
  }

  private handleKeyPacket(body: Uint8Array) {
    try {
      const op = body[0];
      if (op !== 0x2e && op !== 0x00) {
        throw new Error(`expected KeyPacket opcode 0x2E or 0x00, got 0x${op.toString(16)}`);
      }

      // Mobius/L2J: op 0x2E, then a result byte (0=wrong protocol, 1=ok),
      // then the 8-byte seed, then PACKET_ENCRYPTION (int).
      // Classic op 0x00 puts the seed immediately after the opcode (no result).
      let seedOffset = 1;
      let result = 1;
      if (op === 0x2e) {
        result = body[1];
        seedOffset = 2;
      }

      if (result !== 1) {
        throw new Error(`server rejected protocol ${this.opts.protocolRevision} (result=${result}); expected 502`);
      }
      if (body.length < seedOffset + 8) {
        throw new Error(`KeyPacket too short: ${body.length}B`);
      }

      const seed = body.slice(seedOffset, seedOffset + 8);

      // PACKET_ENCRYPTION: the int right after the 8-byte seed.
      // 0 → server runs plaintext; do NOT encrypt/decrypt anything.
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

      // If the server accepts the auth but never sends CharSelectionInfo, it is
      // almost always a GS↔LS session validation / account-in-use issue.
      this.authTimer = setTimeout(() => {
        this.settle({
          type: "error",
          error:
            "[GS] AuthLogin accepted but no CharSelectionInfo within 8s — likely " +
            "GS↔LS session validation or account already in use. Restart servers / wait, try once.",
        });
      }, 8000);
    } catch (err) {
      this.settle({ type: "error", error: `[GS] KeyPacket: ${(err as Error).message}` });
    }
  }

  // ===== TX =====

  private sendFrame(plainBody: Uint8Array, encrypt: boolean) {
    if (!this.ws) return;
    const payload = encrypt && this.crypt ? this.crypt.encrypt(plainBody) : plainBody;
    if (encrypt && this.crypt) {
      this.emit({ type: "status", message: `[GS] → enc ${payload.length}B ${hex(payload, 16)}` });
    }
    const total = payload.length + 2;
    const out = new Uint8Array(total);
    out[0] = total & 0xff;
    out[1] = (total >>> 8) & 0xff;
    out.set(payload, 2);
    this.ws.send(out.buffer.slice(0));
  }

  private sendProtocolVersion() {
    // ProtocolVersion (0x0E) — ALWAYS plaintext, before any crypt exists.
    const body = new PacketWriter().u8(0x0e).u32(this.opts.protocolRevision).build();
    this.emit({
      type: "status",
      message: `[GS] → ProtocolVersion 0x${this.opts.protocolRevision.toString(16)}`,
    });
    this.sendFrame(body, false);
  }

  private sendAuthLogin() {
    // AuthLogin (0x2B). Mobius reads: String name, playKey2, playKey1,
    // loginKey1, loginKey2. Encrypt ONLY if the server enabled encryption.
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

  // ===== Parsing =====

  /**
   * CharSelectionInfo (0x09), Mobius 12.3 Superion / protocol 502.
   * Header: count(u32) + maxChars(u32) + byte + byte + int + byte + byte,
   * then `count` full per-character blocks. We consume the entire per-char
   * block so multiple characters stay aligned, but only surface what the UI
   * needs (name, objectId, sex, race, baseClass, level).
   */
  private parseCharSelectionInfo(body: Uint8Array) {
    try {
      const r = new PacketReader(body);
      r.u8(); // opcode 0x09
      const count = r.u32(); // FIX: count is u32, not u8
      if (count > 32) {
        this.settle({ type: "error", error: `[GS] implausible char count: ${count}` });
        return;
      }
      // Header before the char array: 12 bytes.
      r.skip(4); // maxCharactersPerAccount
      r.skip(1); // (size == max) flag
      r.skip(1); // can-play flag
      r.skip(4); // korean-client int (=2)
      r.skip(1); // inactive-gift flag
      r.skip(1); // balthus-knights flag

      const chars: GameCharacter[] = [];
      for (let i = 0; i < count; i++) {
        // --- per-char prefix: everything up to and including `level` ---
        const name = r.str();
        const objectId = r.u32();
        r.str(); // accountName
        r.u32(); // sessionId
        r.u32(); // clanId
        r.u32(); // builderLevel
        r.u32(); // sex
        const race = r.u32();
        const baseClass = r.u32();
        r.u32(); // serverId  (NOT "active")
        r.skip(12); // x, y, z  (3× int)
        r.skip(8); // currentHp (double)
        r.skip(8); // currentMp (double)
        r.skip(8); // sp (long)
        r.skip(8); // exp (long)
        r.skip(8); // expPercent (double)
        const level = r.u32();

        // Surface the char immediately — we already have all the UI needs.
        chars.push({
          id: objectId.toString(16),
          name,
          klass: classNameOf(baseClass),
          race: raceNameOf(race),
          level,
          color: colorFromName(name),
        });

        // --- skip the constant tail to reach the next char (if any) ---
        if (i < count - 1) {
          r.skip(CHAR_TAIL_AFTER_LEVEL);
          if (r.remaining < 0) {
            this.emit({
              type: "status",
              message: `[GS] char #${i} tail overran — CHAR_TAIL_AFTER_LEVEL may need tuning for this build`,
            });
            break;
          }
        }
      }

      this.emit({ type: "status", message: `[GS] parsed ${chars.length} character(s)` });
      this.settle({ type: "characters", chars });
    } catch (err) {
      this.settle({
        type: "error",
        error: `[GS] CharSelectionInfo parse failed: ${(err as Error).message}`,
      });
    }
  }
}
