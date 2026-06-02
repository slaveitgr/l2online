/**
 * Lineage 2 login-server client. Drives the WebSocket↔TCP bridge through the
 * full handshake until either a server list arrives or the server reports
 * an authentication failure.
 *
 * Flow:
 *   1. Open WS to /api/l2-bridge?host=...&port=2106
 *   2. Wait for "connected" control message
 *   3. Read first packet (Init) — plaintext on the wire, parses to:
 *       - session id (u32)
 *       - protocol revision (u32)
 *       - 128-byte RSA public key (scrambled)
 *       - 16-byte Blowfish key (used for everything after Init)
 *   4. Switch to Blowfish on TX/RX
 *   5. Reply AuthGameGuard with session id (no GG check)
 *   6. Wait for GGAuth response (ok)
 *   7. Send RequestAuthLogin with RSA-encrypted credentials block
 *   8. Either LoginOk (success) or LoginFail (error code)
 *   9. Send RequestServerList → receive ServerList
 *
 * Notes:
 *   - We accept Classic-style single 128-byte credential block first; if the
 *     server rejects with "wrong protocol", caller can retry with the 256-byte
 *     two-block layout used by newer chronicles.
 *   - The very first packet (Init) is NOT XOR-checksum'd in some chronicles.
 *     We use it as-is.
 */
import { Blowfish } from "./blowfish";
import { packAuthLoginBlock, rsaEncryptBlock, unscrambleModulus } from "./rsa";
import { appendChecksumAndPad, decXORPass, PacketReader, PacketWriter } from "./packets";

/**
 * Static Blowfish key used by L2J Mobius for the very first Init packet
 * (see `loginserver/network/LoginEncryption.STATIC_BLOWFISH_KEY`).
 */
const STATIC_BLOWFISH_KEY = new Uint8Array([
  0x6b, 0x60, 0xcb, 0x5b, 0x82, 0xce, 0x90, 0xb1,
  0xcc, 0x2b, 0x6c, 0x55, 0x6c, 0x6c, 0x6c, 0x6c,
]);

function hex(b: Uint8Array, max = 48): string {
  const n = Math.min(b.length, max);
  let s = "";
  for (let i = 0; i < n; i++) s += (i ? " " : "") + b[i].toString(16).padStart(2, "0");
  if (b.length > max) s += ` …(+${b.length - max})`;
  return s;
}


export type LoginEvent =
  | { type: "status"; message: string }
  | { type: "init"; protocolRevision: number; sessionId: number }
  | { type: "gg-ok" }
  | { type: "login-ok"; sessionKey1: [number, number]; sessionKey2: [number, number] }
  | { type: "login-fail"; reason: string; code: number }
  | { type: "server-list"; servers: GameServer[] }
  | { type: "raw"; direction: "in" | "out"; bytes: Uint8Array; opcode: number }
  | { type: "error"; error: string }
  | { type: "closed" };

export interface GameServer {
  id: number;
  ip: string;
  port: number;
  ageLimit: number;
  pvp: boolean;
  currentPlayers: number;
  maxPlayers: number;
  status: number; // 0=down 1=light 2=normal 3=heavy 4=full
  type: number;
  brackets: boolean;
}

export interface LoginOptions {
  host: string;
  port?: number;
  username: string;
  password: string;
  bridgeUrl?: string; // override for testing
  onEvent?: (ev: LoginEvent) => void;
}

const FAIL_REASONS: Record<number, string> = {
  0x01: "System error",
  0x02: "Password does not match this account",
  0x03: "Password does not match this account",
  0x04: "Access failed",
  0x05: "Incorrect account information",
  0x07: "Account already in use",
  0x09: "Account banned",
  0x10: "Server overloaded",
  0x12: "Account expired",
  0x13: "Wrong server",
  0x16: "Dual-box not allowed",
  0x1e: "Server maintenance",
  0x20: "Temporary account",
  0x21: "Game time expired",
  0x22: "Account requires age verification",
};

export class L2LoginClient {
  private ws: WebSocket | null = null;
  private bf: Blowfish | null = null;
  private rxBuffer: Uint8Array = new Uint8Array(0);
  private gotInit = false;
  private sessionId = 0;
  private protocolRevision = 0;
  private rsaModulus: Uint8Array | null = null;
  private sentAuth = false;
  private resolve!: (ev: LoginEvent) => void;
  private settled = false;
  private opts: LoginOptions;

  constructor(opts: LoginOptions) {
    this.opts = opts;
  }

  /** Returns the terminal event (login-ok+server-list, login-fail, error, or closed). */
  start(): Promise<LoginEvent> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      const port = this.opts.port ?? 2106;
      const proto = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";
      const base = this.opts.bridgeUrl ?? `${proto}//${window.location.host}/api/l2-bridge`;
      const url = `${base}?host=${encodeURIComponent(this.opts.host)}&port=${port}`;
      this.emit({ type: "status", message: `Connecting to bridge ${url}` });

      const ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";
      this.ws = ws;

      ws.onopen = () => this.emit({ type: "status", message: "WebSocket open, waiting for TCP connect…" });
      ws.onclose = (ev) => {
        if (!this.settled) this.settle({ type: "closed" }, `closed code=${ev.code} reason=${ev.reason}`);
      };
      ws.onerror = () => this.settle({ type: "error", error: "WebSocket error" });
      ws.onmessage = (ev) => this.onMessage(ev.data);
    });
  }

  private emit(ev: LoginEvent) {
    this.opts.onEvent?.(ev);
  }

  private settle(ev: LoginEvent, statusOnSettle?: string) {
    if (this.settled) return;
    this.settled = true;
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
          this.emit({ type: "status", message: `TCP connected ${msg.host}:${msg.port}` });
        } else if (msg?.type === "error") {
          this.settle({ type: "error", error: `Bridge: ${msg.error}` });
        }
      } catch {
        /* ignore */
      }
      return;
    }
    if (!(data instanceof ArrayBuffer)) return;
    const bytes = new Uint8Array(data);
    // Append to rx buffer and consume framed packets.
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
        this.settle({ type: "error", error: `Invalid packet length: ${length}` });
        return;
      }
      if (this.rxBuffer.length < length) return; // need more data
      const body = this.rxBuffer.slice(2, length);
      this.rxBuffer = this.rxBuffer.slice(length);
      this.handlePacket(body);
    }
  }

  private handlePacket(rawBody: Uint8Array) {
    // First packet (Init) is Blowfish-encrypted with a STATIC key and then
    // XOR-passed inside the payload (L2J Mobius `LoginEncryption.encrypt`,
    // static branch — no checksum is appended for the static packet, only
    // an XOR pass that embeds its accumulator at bytes [size-8..size-4]).
    if (!this.gotInit) {
      this.gotInit = true;
      this.emit({ type: "status", message: `← init enc ${rawBody.length}B ${hex(rawBody, 16)}` });
      let body: Uint8Array;
      try {
        if (rawBody.length % 8 !== 0) throw new Error(`init length ${rawBody.length} not multiple of 8`);
        const staticBf = new Blowfish(STATIC_BLOWFISH_KEY);
        body = staticBf.decrypt(rawBody);
        decXORPass(body, 0, body.length);
      } catch (err) {
        this.settle({ type: "error", error: `Init decrypt failed: ${(err as Error).message}` });
        return;
      }
      this.emit({ type: "status", message: `← init dec ${body.length}B ${hex(body, 32)}` });
      try {
        const r = new PacketReader(body);
        const op = r.u8();
        if (op !== 0x00) throw new Error(`expected Init opcode 0x00, got 0x${op.toString(16)}`);
        const sessionId = r.u32();
        const proto = r.u32();
        const rsa = r.bytes(128);
        r.skip(16); // 4×u32 GG dummy values (Init.java)
        const bfKey = r.bytes(16);

        this.sessionId = sessionId;
        this.protocolRevision = proto;
        this.rsaModulus = unscrambleModulus(rsa);
        this.bf = new Blowfish(bfKey);

        this.emit({ type: "init", protocolRevision: proto, sessionId });
        this.emit({
          type: "status",
          message: `Init OK. revision=0x${proto.toString(16)} session=0x${sessionId.toString(16)} bfKey=${hex(bfKey, 16)}`,
        });
        this.sendGameGuardAuth();
      } catch (err) {
        this.settle({ type: "error", error: `Init parse failed: ${(err as Error).message}` });
      }
      return;
    }

    // Subsequent packets: Blowfish-decrypt with the per-session key.
    let body: Uint8Array;
    try {
      body = this.bf!.decrypt(rawBody);
    } catch (err) {
      this.settle({ type: "error", error: `Blowfish decrypt failed: ${(err as Error).message}` });
      return;
    }
    const opcode = body[0];
    this.emit({ type: "raw", direction: "in", bytes: body, opcode });
    this.emit({ type: "status", message: `← opcode 0x${opcode.toString(16).padStart(2, "0")} (${body.length}B) ${hex(body, 24)}` });

    // L2J Mobius opcode map (loginserver/network/LoginServerPackets.java):
    //   0x00 Init  0x01 LoginFail  0x02 AccountKicked  0x03 LoginOk
    //   0x04 ServerList  0x06 PlayFail  0x07 PlayOk  0x0B GGAuth
    //   0x0D LoginOptFail  0x11 PIAgreementCheck  0x12 PIAgreementAck
    switch (opcode) {
      case 0x0b: {
        this.emit({ type: "gg-ok" });
        this.sendRequestAuthLogin();
        return;
      }
      case 0x03: {
        // LoginOk: opcode + sessionKey1 (2×u32) + ...
        const r = new PacketReader(body);
        r.u8();
        const k1a = r.u32();
        const k1b = r.u32();
        this.emit({ type: "login-ok", sessionKey1: [k1a, k1b], sessionKey2: [0, 0] });
        this.sendRequestServerList(k1a, k1b);
        return;
      }
      case 0x01: {
        const r = new PacketReader(body);
        r.u8();
        const reason = r.u32();
        const text = FAIL_REASONS[reason] ?? `Unknown failure code 0x${reason.toString(16)}`;
        this.settle({ type: "login-fail", reason: text, code: reason });
        return;
      }
      case 0x02: {
        this.settle({ type: "login-fail", reason: "Account kicked", code: 0x02 });
        return;
      }
      case 0x04: {
        const r = new PacketReader(body);
        r.u8();
        const count = r.u8();
        r.u8(); // last server id used
        const servers: GameServer[] = [];
        for (let i = 0; i < count; i++) {
          const id = r.u8();
          const ip = [r.u8(), r.u8(), r.u8(), r.u8()].join(".");
          const port = r.u32();
          const ageLimit = r.u8();
          const pvp = r.u8() !== 0;
          const currentPlayers = r.u16();
          const maxPlayers = r.u16();
          const status = r.u8();
          const type = r.u32();
          const brackets = r.u8() !== 0;
          servers.push({ id, ip, port, ageLimit, pvp, currentPlayers, maxPlayers, status, type, brackets });
        }
        this.settle({ type: "server-list", servers });
        return;
      }
      case 0x06: {
        this.settle({ type: "login-fail", reason: "Play failed (server rejected)", code: 0x06 });
        return;
      }
      case 0x0d: {
        const r = new PacketReader(body);
        r.u8();
        const reason = r.u32();
        this.settle({ type: "login-fail", reason: `Login option failed (0x${reason.toString(16)})`, code: 0x0d });
        return;
      }
      case 0x11: {
        // PIAgreementCheck: server asks if user has accepted Korean PI agreement.
        // We auto-reply with RequestPIAgreement(agreement=1) so the flow continues.
        this.emit({ type: "status", message: "PIAgreementCheck → auto-accepting" });
        this.sendRequestPIAgreement();
        return;
      }
      case 0x12: {
        // PIAgreementAck — no action, just wait for LoginOk.
        this.emit({ type: "status", message: "PIAgreementAck received" });
        return;
      }
      default: {
        this.emit({ type: "status", message: `Unhandled opcode 0x${opcode.toString(16)} (${body.length} bytes)` });
      }
    }

  }

  // ===== TX =====

  private sendFrame(plainBody: Uint8Array) {
    if (!this.ws) return;
    const enc = this.bf ? this.bf.encrypt(appendChecksumAndPad(plainBody)) : plainBody;
    const out = new Uint8Array(enc.length + 2);
    const total = enc.length + 2;
    out[0] = total & 0xff;
    out[1] = (total >>> 8) & 0xff;
    out.set(enc, 2);
    this.emit({ type: "raw", direction: "out", bytes: plainBody, opcode: plainBody[0] });
    this.ws.send(out.buffer.slice(0));
  }

  private sendGameGuardAuth() {
    // AuthGameGuard (opcode 0x07): session id + 16 bytes of zeros
    const body = new PacketWriter().u8(0x07).u32(this.sessionId).u32(0).u32(0).u32(0).u32(0).build();
    this.emit({ type: "status", message: "Sending AuthGameGuard" });
    this.sendFrame(body);
  }

  private sendRequestAuthLogin() {
    if (!this.rsaModulus) {
      this.settle({ type: "error", error: "RSA modulus missing" });
      return;
    }
    if (this.sentAuth) return;
    this.sentAuth = true;
    const block = packAuthLoginBlock(this.opts.username, this.opts.password);
    const encrypted = rsaEncryptBlock(block, this.rsaModulus);
    // RequestAuthLogin (opcode 0x00) for Classic = single 128-byte block + 16 bytes session
    const body = new PacketWriter()
      .u8(0x00)
      .bytes(encrypted)
      .u32(0).u32(0).u32(0).u32(0)
      .build();
    this.emit({ type: "status", message: "Sending RequestAuthLogin" });
    this.sendFrame(body);
  }

  private sendRequestServerList(k1a: number, k1b: number) {
    // RequestServerList (opcode 0x05): sessionKey1.high/low + last server id
    const body = new PacketWriter().u8(0x05).u32(k1a).u32(k1b).u8(0).build();
    this.emit({ type: "status", message: "Sending RequestServerList" });
    this.sendFrame(body);
  }

  private sendRequestPIAgreement() {
    // RequestPIAgreement (opcode 0x0F): session id + agreement flag = 1
    const body = new PacketWriter()
      .u8(0x0f)
      .u32(this.sessionId)
      .u8(0x01)
      .build();
    this.emit({ type: "status", message: "Sending RequestPIAgreement(accept=1)" });
    this.sendFrame(body);
  }
}

