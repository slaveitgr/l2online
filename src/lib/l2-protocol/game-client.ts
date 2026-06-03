/**
 * L2 Game Server client — Mobius 12.3 "Superion", protocol 502.
 *
 *   ProtocolVersion(0x0E) → KeyPacket(0x2E) → AuthLogin(0x2B)
 *     → CharSelectionInfo(0x09)            [roster]
 *     → CharacterSelect(0x12) → CharSelected(0x0B)
 *     → EnterWorld(0x11)                   [spawn handshake]
 *     → world packets: UserInfo / NpcInfo / Move / Delete …
 *
 * Now includes a lightweight WORLD ENTITY LAYER: it parses the player's own
 * position/stats from CharSelected, plus NpcInfo(0x0C) spawns,
 * MoveToLocation(0x2F) moves and DeleteObject(0x08) despawns, maintaining an
 * entity map the viewport can render. Encryption gate honoured (slave.gr = off).
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
  hp: number; // current HP (= max at char select)
  mp: number; // current MP
  sp: number; // skill points
  expPercent: number; // 0..100 within current level
  color: string;
}

/** The player's own character, from CharSelected (flat, reliable). */
export interface PlayerState {
  objectId: number;
  name: string;
  x: number;
  y: number;
  z: number;
  hp: number;
  mp: number;
  level: number;
  classId: number;
  raceId: number;
}

/** A world object (NPC / monster) we render as a marker. */
export interface WorldEntity {
  objectId: number;
  displayId: number; // npc template id (displayId - 1000000)
  x: number;
  y: number;
  z: number;
  heading: number;
}

export type GameEvent =
  | { type: "status"; message: string }
  | { type: "key-ok" }
  | { type: "characters"; chars: GameCharacter[] }
  | { type: "char-selected"; name: string; objectId: number; x: number; y: number; z: number }
  | { type: "player"; player: PlayerState }
  | { type: "in-world"; message: string }
  | { type: "world-packet"; opcode: number; length: number }
  | { type: "npc-spawn"; entity: WorldEntity }
  | { type: "npc-move"; objectId: number; x: number; y: number; z: number }
  | { type: "npc-remove"; objectId: number }
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
  keepAlive?: boolean;
  onEvent?: (ev: GameEvent) => void;
}

// CharSelectionInfo per-char tail (slave.gr build). See reference doc.
const CHAR_TAIL_AFTER_LEVEL = 495;

// Server opcodes we parse in the world phase.
const OP_NPC_INFO = 0x0c;
const OP_DELETE_OBJECT = 0x08;
const OP_MOVE_TO_LOCATION = 0x2f;

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
  private resolved = false;
  private resolve!: (ev: GameEvent) => void;
  private opts: GameLoginOptions;
  private authTimer: ReturnType<typeof setTimeout> | null = null;
  private chars: GameCharacter[] = [];

  // ── world entity layer ──
  private listeners = new Set<(ev: GameEvent) => void>();
  private _player: PlayerState | null = null;
  private _entities = new Map<number, WorldEntity>();

  constructor(opts: GameLoginOptions) {
    this.opts = opts;
  }

  // ===== lifecycle =====

  start(): Promise<GameEvent> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      const proto =
        typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";
      const base = this.opts.bridgeUrl ?? `${proto}//${window.location.host}/api/l2-bridge`;
      const url = `${base}?host=${encodeURIComponent(this.opts.host)}&port=${this.opts.port}`;
      this.emit({ type: "status", message: `[GS] connecting bridge ${url}` });
      const ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";
      this.ws = ws;
      ws.onopen = () => this.emit({ type: "status", message: "[GS] WebSocket open" });
      ws.onclose = (ev) => {
        if (!this.resolved)
          this.finish({ type: "closed" }, `[GS] closed code=${ev.code} reason=${ev.reason}`);
        else this.emit({ type: "closed" });
      };
      ws.onerror = () => {
        if (!this.resolved) this.finish({ type: "error", error: "[GS] WebSocket error" });
      };
      ws.onmessage = (ev) => this.onMessage(ev.data);
    });
  }

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

  // ── entity accessors (for the viewport) ──
  getPlayer(): PlayerState | null {
    return this._player;
  }
  getEntities(): WorldEntity[] {
    return Array.from(this._entities.values());
  }

  /** Subscribe to events without clobbering the primary handler. Returns an unsubscribe fn. */
  addListener(cb: (ev: GameEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Re-point the primary event handler (legacy single-handler API). */
  setEventHandler(cb: (ev: GameEvent) => void) {
    this.opts.onEvent = cb;
  }

  private emit(ev: GameEvent) {
    this.opts.onEvent?.(ev);
    for (const l of this.listeners) {
      try {
        l(ev);
      } catch {
        /* ignore listener errors */
      }
    }
  }

  private resolveOnce(ev: GameEvent) {
    if (this.resolved) return;
    this.resolved = true;
    this.resolve(ev);
  }

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

    if (this.phase === "entering" || this.phase === "in-world") {
      if (this.phase === "entering") {
        this.phase = "in-world";
        this.emit({ type: "in-world", message: "[GS] EnterWorld accepted — receiving world state" });
      }
      this.emit({ type: "world-packet", opcode, length: body.length });
      // Parse the handful of packets that move the world. Everything else is
      // ignored for now (chat, skills, inventory, ExPackets…).
      try {
        if (opcode === OP_NPC_INFO) this.parseNpcInfo(body);
        else if (opcode === OP_MOVE_TO_LOCATION) this.parseMoveToLocation(body);
        else if (opcode === OP_DELETE_OBJECT) this.parseDeleteObject(body);
      } catch {
        /* one bad packet shouldn't kill the stream */
      }
      return;
    }

    this.emit({
      type: "status",
      message: `[GS] ← op 0x${opcode.toString(16).padStart(2, "0")} (${body.length}B) ${hex(body)}`,
    });

    if (opcode === 0x09 && this.phase !== "selecting") {
      if (this.authTimer) {
        clearTimeout(this.authTimer);
        this.authTimer = null;
      }
      this.parseCharSelectionInfo(body);
      return;
    }
    if (opcode === 0x0b && this.phase === "selecting") {
      this.parseCharSelected(body);
      this.sendEnterWorld();
      return;
    }
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
        throw new Error(
          `server rejected protocol ${this.opts.protocolRevision} (result=${result}); expected 502`
        );
      }
      if (body.length < seedOffset + 8) throw new Error(`KeyPacket too short: ${body.length}B`);

      const seed = body.slice(seedOffset, seedOffset + 8);
      const encOff = seedOffset + 8;
      let useEncryption = false;
      if (body.length >= encOff + 4) {
        const flag =
          (body[encOff] |
            (body[encOff + 1] << 8) |
            (body[encOff + 2] << 16) |
            (body[encOff + 3] << 24)) >>>
          0;
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

  selectCharacter(slot: number) {
    if (!this.connected) {
      this.emit({ type: "error", error: "[GS] not connected — cannot select character" });
      return;
    }
    this.phase = "selecting";
    const body = new PacketWriter().u8(0x12).u32(slot).u16(0).u32(0).u32(0).u32(0).build();
    this.emit({ type: "status", message: `[GS] → CharacterSelect slot=${slot}` });
    this.sendFrame(body, this.useEncryption);
  }

  private sendEnterWorld() {
    this.phase = "entering";
    const body = new PacketWriter().u8(0x11).bytes(new Uint8Array(104)).build();
    this.emit({ type: "status", message: "[GS] → EnterWorld" });
    this.sendFrame(body, this.useEncryption);
  }

  // ===== Public action senders =====

  sendMoveTo(x: number, y: number, z: number) {
    if (!this.connected) return;
    const p = this._player;
    const ox = p?.x ?? x;
    const oy = p?.y ?? y;
    const oz = p?.z ?? z;
    const body = new PacketWriter()
      .u8(0x01)
      .u32(x | 0).u32(y | 0).u32(z | 0)
      .u32(ox | 0).u32(oy | 0).u32(oz | 0)
      .u32(0)
      .build();
    this.sendFrame(body, this.useEncryption);
  }

  sendAction(objectId: number, shift = false) {
    if (!this.connected) return;
    const p = this._player;
    const body = new PacketWriter()
      .u8(0x04)
      .u32(objectId)
      .u32((p?.x ?? 0) | 0)
      .u32((p?.y ?? 0) | 0)
      .u32((p?.z ?? 0) | 0)
      .u8(shift ? 1 : 0)
      .build();
    this.sendFrame(body, this.useEncryption);
  }

  sendAttack(objectId: number) {
    this.sendAction(objectId, true);
  }

  sendSay(text: string, channel = 0) {
    if (!this.connected || !text) return;
    const body = new PacketWriter()
      .u8(0x49)
      .str(text)
      .u32(channel)
      .str("")
      .build();
    this.sendFrame(body, this.useEncryption);
  }

  // ===== Parsing: roster =====

  private parseCharSelectionInfo(body: Uint8Array) {
    try {
      const r = new PacketReader(body);
      r.u8();
      const count = r.u32();
      if (count > 32) {
        this.finish({ type: "error", error: `[GS] implausible char count: ${count}` });
        return;
      }
      r.skip(12);

      const chars: GameCharacter[] = [];
      for (let i = 0; i < count; i++) {
        const name = r.str();
        const objectId = r.u32();
        r.str();
        r.u32();
        r.u32();
        r.u32();
        r.u32();
        const race = r.u32();
        const baseClass = r.u32();
        r.u32();           // serverId
        r.skip(12);        // x, y, z
        const hp = r.f64(); // currentHp (== maxHp at char select)
        const mp = r.f64(); // currentMp
        const sp = Number(r.u64());
        r.u64();           // exp (absolute)
        const expPct = r.f64(); // 0..1 within level
        const level = r.u32();

        chars.push({
          id: objectId.toString(16),
          name,
          klass: classNameOf(baseClass),
          race: raceNameOf(race),
          level,
          hp, mp, sp,
          expPercent: expPct * 100,
          color: colorFromName(name),
        });

        if (i < count - 1) {
          r.skip(CHAR_TAIL_AFTER_LEVEL);
          if (r.remaining < 0) break;
        }
      }

      this.chars = chars;
      this.phase = "roster";
      this.emit({ type: "status", message: `[GS] parsed ${chars.length} character(s)` });
      this.emit({ type: "characters", chars });
      this.resolveOnce({ type: "characters", chars });
      if (!this.opts.keepAlive) this.disconnect();
    } catch (err) {
      this.finish({ type: "error", error: `[GS] CharSelectionInfo parse failed: ${(err as Error).message}` });
    }
  }

  // ===== Parsing: player =====

  private parseCharSelected(body: Uint8Array) {
    try {
      const r = new PacketReader(body);
      r.u8(); // 0x0b
      const name = r.str();
      const objectId = r.u32();
      r.str(); // title
      r.u32(); // sessionId
      r.u32(); // clanId
      r.u32(); // 0
      r.u32(); // isFemale
      const raceId = r.u32();
      const classId = r.u32();
      r.u32(); // active
      const x = r.u32() | 0;
      const y = r.u32() | 0;
      const z = r.u32() | 0;
      const hp = r.f64();
      const mp = r.f64();
      r.u64(); // sp
      r.u64(); // exp
      const level = r.u32();

      this._player = { objectId, name, x, y, z, hp, mp, level, classId, raceId };
      this.emit({ type: "status", message: `[GS] CharSelected "${name}" @ ${x},${y},${z} Lv${level}` });
      this.emit({ type: "char-selected", name, objectId, x, y, z });
      this.emit({ type: "player", player: this._player });
    } catch {
      this.emit({ type: "status", message: "[GS] CharSelected received (unparsed)" });
    }
  }

  // ===== Parsing: world entities =====

  /** NpcInfo (0x0C): masked packet — skip the mask/init/block headers to the position. */
  private parseNpcInfo(body: Uint8Array) {
    const r = new PacketReader(body);
    r.u8(); // 0x0c
    const objectId = r.u32();
    r.u8(); // summon anim
    r.u16(); // mask bit count (39)
    r.skip(5); // _masks (5 bytes for 39 bits)
    const initSize = r.u8();
    r.skip(initSize); // init block (attackable + long + title)
    r.u16(); // _blockSize
    const displayId = (r.u32() | 0) - 1000000;
    const x = r.u32() | 0;
    const y = r.u32() | 0;
    const z = r.u32() | 0;
    const heading = r.u32() | 0;

    const entity: WorldEntity = { objectId, displayId, x, y, z, heading };
    this._entities.set(objectId, entity);
    this.emit({ type: "npc-spawn", entity });
  }

  /** MoveToLocation (0x2F): objectId + dest(x,y,z) + src(x,y,z). */
  private parseMoveToLocation(body: Uint8Array) {
    const r = new PacketReader(body);
    r.u8(); // 0x2f
    const objectId = r.u32();
    const x = r.u32() | 0;
    const y = r.u32() | 0;
    const z = r.u32() | 0;
    const ent = this._entities.get(objectId);
    if (ent) {
      ent.x = x;
      ent.y = y;
      ent.z = z;
      this.emit({ type: "npc-move", objectId, x, y, z });
    }
  }

  /** DeleteObject (0x08): objectId + byte. */
  private parseDeleteObject(body: Uint8Array) {
    const r = new PacketReader(body);
    r.u8(); // 0x08
    const objectId = r.u32();
    if (this._entities.delete(objectId)) {
      this.emit({ type: "npc-remove", objectId });
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
