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
import { logUnknownOpcode } from "./unknown-opcode-log";

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
  maxHp?: number;
  maxMp?: number;
  cp?: number;
  maxCp?: number;
  /** Paperdoll item ids — populated by UserInfo (0x32) when masks decode. */
  equip?: Partial<Record<PaperdollSlot, number>>;
}

/** A world object (NPC / monster) we render as a marker. */
export type PaperdollSlot =
  | "rhand" | "lhand" | "gloves" | "chest" | "legs" | "feet" | "head" | "cloak";

export interface WorldEntity {
  objectId: number;
  displayId: number; // npc template id (displayId - 1000000)
  x: number;
  y: number;
  z: number;
  heading: number;
  isPlayer?: boolean; // true when spawned from CharInfo (another player)
  name?: string; // visible name (players)
  race?: number; // race ordinal (players) — for picking the right model
  female?: boolean;
  classId?: number; // player class — drives model/animation set (S15/S7)
  equip?: Partial<Record<PaperdollSlot, number>>; // non-zero paperdoll item ids
  hp?: number; // current HP (from StatusUpdate)
  maxHp?: number;
  level?: number;
  dead?: boolean;
}

/** One learnable/usable skill from SkillList (0x5F). */
export interface SkillEntry {
  id: number;
  level: number;
  subLevel: number;
  passive: boolean;
  disabled: boolean;
  enchanted: boolean;
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
  | { type: "attack"; attackerId: number; targetId: number; damage: number; miss: boolean; crit: boolean }
  | { type: "status-update"; objectId: number; hp?: number; maxHp?: number; mp?: number; maxMp?: number; cp?: number; maxCp?: number; level?: number }
  | { type: "die"; objectId: number; isPlayer: boolean }
  | { type: "target-selected"; objectId: number }
  | { type: "target-unselected"; objectId: number }
  | { type: "chat"; channel: number; sender: string; text: string }
  | { type: "system-message"; text: string }
  | { type: "skill-list"; skills: SkillEntry[] }
  | { type: "html"; npcObjId: number; html: string }
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
const OP_CHAR_INFO = 0x31; // other players entering broadcast range
const OP_USER_INFO = 0x32; // our own state/position refresh (mask-based)
const OP_DIE = 0x00;
const OP_NPC_HTML = 0x19;
const OP_ITEM_LIST = 0x11;
const OP_STATUS_UPDATE = 0x18;
const OP_TARGET_SELECTED = 0x23;
const OP_TARGET_UNSELECTED = 0x24;
const OP_ATTACK = 0x33;
const OP_SAY2 = 0x4a;
const OP_SKILL_LIST = 0x5f;
const OP_SYSTEM_MESSAGE = 0x62;
const OP_MY_TARGET_SELECTED = 0xb9;

// StatusUpdate field client-ids (Mobius StatusUpdateType).
const SU_LEVEL = 0x01, SU_CUR_HP = 0x09, SU_MAX_HP = 0x0a, SU_CUR_MP = 0x0b, SU_MAX_MP = 0x0c, SU_CUR_CP = 0x20, SU_MAX_CP = 0x21;
// SystemMessage param type ids.
const SM_TYPE_TEXT = 0, SM_TYPE_PLAYER_NAME = 12;

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
  private _targetId: number | null = null;
  private _skills: SkillEntry[] = [];

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
  getEntity(objectId: number): WorldEntity | undefined {
    return this._entities.get(objectId);
  }
  getTargetId(): number | null {
    return this._targetId;
  }
  getTarget(): WorldEntity | undefined {
    return this._targetId != null ? this._entities.get(this._targetId) : undefined;
  }
  getSkills(): SkillEntry[] {
    return this._skills;
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
        else if (opcode === OP_CHAR_INFO) this.parseCharInfo(body);
        else if (opcode === OP_MOVE_TO_LOCATION) this.parseMoveToLocation(body);
        else if (opcode === OP_DELETE_OBJECT) this.parseDeleteObject(body);
        else if (opcode === OP_STATUS_UPDATE) this.parseStatusUpdate(body);
        else if (opcode === OP_ATTACK) this.parseAttack(body);
        else if (opcode === OP_DIE) this.parseDie(body);
        else if (opcode === OP_MY_TARGET_SELECTED) this.parseMyTargetSelected(body);
        else if (opcode === OP_TARGET_SELECTED) this.parseTargetSelected(body);
        else if (opcode === OP_TARGET_UNSELECTED) this.parseTargetUnselected(body);
        else if (opcode === OP_SAY2) this.parseSay2(body);
        else if (opcode === OP_SYSTEM_MESSAGE) this.parseSystemMessage(body);
        else if (opcode === OP_SKILL_LIST) this.parseSkillList(body);
        else if (opcode === OP_NPC_HTML) this.parseNpcHtml(body);
        else {
          // S14: log first occurrence of unknown world-phase opcodes
          // so we can chart unmapped packets (UserInfo 0x32, NpcInfo variants, etc.).
          logUnknownOpcode(opcode, body.length, (msg: string) => this.emit({ type: "status", message: msg }));
        }
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
    // MoveBackwardToLocation (client→server) = opcode 0x0F.
    // Body: targetX,Y,Z, originX,Y,Z, movementMode(1=mouse).
    const body = new PacketWriter()
      .u8(0x0f)
      .u32(x | 0).u32(y | 0).u32(z | 0)
      .u32(ox | 0).u32(oy | 0).u32(oz | 0)
      .u32(1)
      .build();
    this.sendFrame(body, this.useEncryption);
    // Optimistically advance our own origin so the next move's source is correct.
    if (this._player) { this._player.x = x; this._player.y = y; this._player.z = z; }
  }

  sendAction(objectId: number, shift = false) {
    if (!this.connected) return;
    const p = this._player;
    // Action (select / interact) = opcode 0x1F. Body: objectId, originX,Y,Z, actionByte.
    const body = new PacketWriter()
      .u8(0x1f)
      .u32(objectId)
      .u32((p?.x ?? 0) | 0)
      .u32((p?.y ?? 0) | 0)
      .u32((p?.z ?? 0) | 0)
      .u8(shift ? 1 : 0)
      .build();
    this.sendFrame(body, this.useEncryption);
  }

  sendAttack(objectId: number) {
    // shift=0 → normal attack/interact. shift=1 = info window (see sendInspect).
    this.sendAction(objectId, false);
  }

  sendInspect(objectId: number) {
    // Action with shift=1 → server opens the info/character window.
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

  /**
   * CharInfo (0x31): another player entering broadcast range.
   * Layout (Mobius 12.3): byte(GrandCrusade) int x int y int z int vehicleId
   * int objId  utf16 name  short race  byte female  int classId … (rest ignored).
   */
  private parseCharInfo(body: Uint8Array) {
    const r = new PacketReader(body);
    r.u8(); // 0x31
    r.u8(); // Grand Crusade flag
    const x = r.u32() | 0;
    const y = r.u32() | 0;
    const z = r.u32() | 0;
    r.u32(); // vehicleId
    const objectId = r.u32();
    const name = r.str();
    const race = r.u16();
    const female = r.u8() !== 0;

    // classId + paperdoll (best-effort; trailing aug/enchant arrays vary by build).
    let classId: number | undefined;
    let equip: WorldEntity["equip"];
    try {
      classId = r.u32();
      r.u32(); // class-id-2 / pad (Grand Crusade reveal)
      // Paperdoll slot ids (u32 each), full L2 order. We only keep the
      // slots that drive rendering today; rest are read to keep alignment.
      const slotOrder = [
        "_under", "_rear", "_lear", "_neck",
        "_rfinger", "_lfinger",
        "head", "rhand", "lhand", "gloves", "chest", "legs", "feet", "cloak",
        "_lrhand", "_hair", "_hair2",
        "_rbracelet", "_lbracelet",
        "_t1", "_t2", "_t3", "_t4", "_t5", "_t6",
        "_belt",
      ] as const;
      const out: NonNullable<WorldEntity["equip"]> = {};
      for (const slot of slotOrder) {
        const id = r.u32();
        if (id && !slot.startsWith("_")) {
          (out as Record<string, number>)[slot] = id;
        }
      }
      if (Object.keys(out).length) equip = out;
    } catch {
      // Body shorter than expected — keep whatever we got so far.
    }

    const entity: WorldEntity = {
      objectId, displayId: -1, x, y, z, heading: 0,
      isPlayer: true, name, race, female,
      ...(classId !== undefined ? { classId } : {}),
      ...(equip ? { equip } : {}),
    };
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
    // The server echoes our OWN movement here too — drive the player from it.
    if (this._player && objectId === this._player.objectId) {
      this._player.x = x;
      this._player.y = y;
      this._player.z = z;
      this.emit({ type: "player", player: this._player });
      return;
    }
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

  // ===== Parsing: combat / status / target / chat / skills =====

  /**
   * StatusUpdate (0x18): int objectId, int casterId, byte visible, byte count,
   * then per entry: byte typeId + (long if CUR_HP/MAX_HP else int).
   * Updates the matching entity/player HP/MP/CP and emits a status-update.
   */
  private parseStatusUpdate(body: Uint8Array) {
    const r = new PacketReader(body);
    r.u8(); // 0x18
    const objectId = r.u32();
    r.u32(); // caster
    r.u8();  // visible
    const count = r.u8();
    const ev: { type: "status-update"; objectId: number; hp?: number; maxHp?: number; mp?: number; maxMp?: number; cp?: number; maxCp?: number; level?: number } = { type: "status-update", objectId };
    for (let i = 0; i < count; i++) {
      const t = r.u8();
      let v: number;
      if (t === SU_CUR_HP || t === SU_MAX_HP) v = Number(r.u64());
      else v = r.u32() | 0;
      if (t === SU_CUR_HP) ev.hp = v;
      else if (t === SU_MAX_HP) ev.maxHp = v;
      else if (t === SU_CUR_MP) ev.mp = v;
      else if (t === SU_MAX_MP) ev.maxMp = v;
      else if (t === SU_CUR_CP) ev.cp = v;
      else if (t === SU_MAX_CP) ev.maxCp = v;
      else if (t === SU_LEVEL) ev.level = v;
    }
    // apply to player or entity
    if (this._player && objectId === this._player.objectId) {
      const p = this._player;
      if (ev.hp != null) p.hp = ev.hp;
      if (ev.maxHp != null) p.maxHp = ev.maxHp;
      if (ev.mp != null) p.mp = ev.mp;
      if (ev.maxMp != null) p.maxMp = ev.maxMp;
      if (ev.cp != null) p.cp = ev.cp;
      if (ev.maxCp != null) p.maxCp = ev.maxCp;
      if (ev.level != null) p.level = ev.level;
      this.emit({ type: "player", player: p });
    } else {
      const e = this._entities.get(objectId);
      if (e) {
        if (ev.hp != null) e.hp = ev.hp;
        if (ev.maxHp != null) e.maxHp = ev.maxHp;
        if (ev.level != null) e.level = ev.level;
      }
    }
    this.emit(ev);
  }

  /**
   * Attack (0x33): attackerId, targetId, soulshot, damage, flags, grade,
   * attacker x/y/z, short extraHits, [extra hits], target x/y/z.
   * Hit flags: 0x80 = miss, 0x20 = crit (Mobius HITFLAG).
   */
  private parseAttack(body: Uint8Array) {
    const r = new PacketReader(body);
    r.u8(); // 0x33
    const attackerId = r.u32();
    const targetId = r.u32();
    r.u32(); // soulshot visual
    const damage = r.u32() | 0;
    const flags = r.u32() | 0;
    this.emit({ type: "attack", attackerId, targetId, damage, miss: (flags & 0x80) !== 0, crit: (flags & 0x20) !== 0 });
  }

  /** Die (0x00): objectId + flags + … . Marks the object dead. */
  private parseDie(body: Uint8Array) {
    const r = new PacketReader(body);
    r.u8(); // 0x00
    const objectId = r.u32();
    const isPlayer = this._player != null && objectId === this._player.objectId;
    const e = this._entities.get(objectId);
    if (e) { e.dead = true; e.hp = 0; }
    this.emit({ type: "die", objectId, isPlayer });
  }

  /** MyTargetSelected (0xB9): int(1) GC, int objectId, short color, int(0). */
  private parseMyTargetSelected(body: Uint8Array) {
    const r = new PacketReader(body);
    r.u8(); // 0xb9
    r.u32(); // Grand Crusade
    const objectId = r.u32();
    this._targetId = objectId;
    this.emit({ type: "target-selected", objectId });
  }

  /** TargetSelected (0x23): objectId + x/y/z (target confirmed for the caster). */
  private parseTargetSelected(body: Uint8Array) {
    const r = new PacketReader(body);
    r.u8(); // 0x23
    r.u32(); // caster
    const objectId = r.u32();
    this._targetId = objectId;
    this.emit({ type: "target-selected", objectId });
  }

  /** TargetUnselected (0x24): objectId + x/y/z. Clears target. */
  private parseTargetUnselected(body: Uint8Array) {
    const r = new PacketReader(body);
    r.u8(); // 0x24
    const objectId = r.u32();
    if (this._targetId === objectId) this._targetId = null;
    this.emit({ type: "target-unselected", objectId });
  }

  /**
   * Say2 / CreatureSay (0x4A): senderObjId, chatType, senderName(str),
   * messageId(int), text(str). Trailing rank bytes ignored.
   */
  private parseSay2(body: Uint8Array) {
    const r = new PacketReader(body);
    r.u8(); // 0x4a
    r.u32(); // sender objId
    const channel = r.u32() | 0;
    const sender = r.str();
    const messageId = r.u32() | 0;
    let text = "";
    if (messageId === -1 >>> 0 || messageId === 0xffffffff || messageId === 0) {
      // normal chat carries an explicit string
      if (r.remaining > 1) text = r.str();
    } else if (r.remaining > 1) {
      text = r.str();
    }
    if (text) this.emit({ type: "chat", channel, sender, text });
  }

  /**
   * SystemMessage (0x62): short msgId, byte paramCount, typed params.
   * We can't render the full SysMsg string table, so we extract any string
   * params (player names / free text) and surface those.
   */
  private parseSystemMessage(body: Uint8Array) {
    const r = new PacketReader(body);
    r.u8(); // 0x62
    r.u16(); // msgId
    const count = r.u8();
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const t = r.u8();
      switch (t) {
        case SM_TYPE_TEXT:
        case SM_TYPE_PLAYER_NAME:
          parts.push(r.str());
          break;
        case 9: case 20: case 24: // element/byte/faction => byte
          r.u8();
          break;
        case 5: case 10: case 13: case 15: // castle/instance/sysstr/classId => short
          r.u16();
          break;
        case 1: case 2: case 3: case 11: // int / npc / item / door => int
          r.u32();
          break;
        case 6: // long
          r.u64();
          break;
        case 4: // skill name => int + short + short
          r.u32(); r.u16(); r.u16();
          break;
        case 7: case 16: // zone / popup => 3 ints
          r.u32(); r.u32(); r.u32();
          break;
        default:
          // unknown param type — stop to avoid desync
          i = count;
          break;
      }
    }
    const text = parts.filter(Boolean).join(" ");
    if (text) this.emit({ type: "system-message", text });
  }

  /**
   * SkillList (0x5F): int count, per skill: int passive, short level,
   * short subLevel, int id, int reuseGroup, byte disabled, byte enchant.
   * Trailing int lastLearnedSkillId.
   */
  private parseSkillList(body: Uint8Array) {
    const r = new PacketReader(body);
    r.u8(); // 0x5f
    const count = r.u32() | 0;
    if (count < 0 || count > 5000) return;
    const skills: SkillEntry[] = [];
    for (let i = 0; i < count; i++) {
      const passive = (r.u32() | 0) !== 0;
      const level = r.u16();
      const subLevel = r.u16();
      const id = r.u32() | 0;
      r.u32(); // reuse group
      const disabled = r.u8() !== 0;
      const enchanted = r.u8() !== 0;
      skills.push({ id, level, subLevel, passive, disabled, enchanted });
    }
    this._skills = skills;
    this.emit({ type: "skill-list", skills });
  }

  /**
   * NpcHtmlMessage (0x19): int npcObjId, string html, int itemId, int sound, byte size.
   * This is how the server delivers NPC dialogs AND the GM/admin panels.
   */
  private parseNpcHtml(body: Uint8Array) {
    const r = new PacketReader(body);
    r.u8(); // 0x19
    const npcObjId = r.u32();
    const html = r.str();
    if (html) this.emit({ type: "html", npcObjId, html });
  }

  // ===== target/skill/admin action senders =====

  /** Use a skill on the current target (RequestMagicSkillUse 0x39). */
  sendUseSkill(skillId: number, ctrl = false, shift = false) {
    if (!this.connected) return;
    const body = new PacketWriter()
      .u8(0x39)
      .u32(skillId)
      .u32(ctrl ? 1 : 0)
      .u8(shift ? 1 : 0)
      .build();
    this.sendFrame(body, this.useEncryption);
  }

  /**
   * RequestBypassToServer (0x23): for clicks on links inside a server-sent HTML
   * (e.g. <a action="bypass admin_x">). The server validates these against the
   * HTML it last sent, so the command MUST be one it issued. Use this ONLY for
   * HTML-link clicks, never for typed commands.
   */
  sendBypass(command: string) {
    if (!this.connected || !command) return;
    const body = new PacketWriter().u8(0x23).str(command).build();
    this.sendFrame(body, this.useEncryption);
  }

  /**
   * SendBypassBuildCmd (0x74): the channel the real client uses for TYPED GM
   * commands ("//cmd"). Send the command WITHOUT the "admin_" prefix — the
   * server prepends it (useAdminCommand "admin_" + cmd). No HTML validation,
   * so this is what actually opens //admin etc.
   */
  sendBuildCmd(command: string) {
    if (!this.connected || !command) return;
    const body = new PacketWriter().u8(0x74).str(command).build();
    this.sendFrame(body, this.useEncryption);
  }

  /** Convenience: send a chat line OR route a typed "//x" GM command. */
  sendChatOrCommand(text: string, channel = 0) {
    if (!text) return false;
    if (text.startsWith("//")) {
      this.sendBuildCmd(text.slice(2)); // 0x74, server adds "admin_"
      return true; // handled as admin command
    }
    this.sendSay(text, channel);
    return false;
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
