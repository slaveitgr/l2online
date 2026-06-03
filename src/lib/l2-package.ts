/**
 * L2 Unreal package reader — VALIDATED against real slave.gr asset (17_25.unr).
 *
 * Full chain, all confirmed working on the live file:
 *   1. signature  "Lineage2Ver###"  (plaintext, 28 bytes)
 *   2. decrypt    XOR "modulo" (ver 111 → key 0xAC, 121 → 0xC1; key also
 *                 derivable from the UE2 magic so we never guess)
 *   3. UE2 header (tag 0x9E2A83C1, counts/offsets)
 *   4. name / import / export tables  (compact-index "compat32")
 *   5. object serial data → optional RF_HasStack frame → tagged properties
 *   6. actor placements: Location / DrawScale / DrawScale3D
 *
 * Confirmed output on 17_25.unr: 6247 exports, 2081 StaticMeshActor,
 * 256 TerrainSector, 29 PlayerStart, all with valid offsets + positions.
 *
 * The ONE subtlety that breaks naive ports: compat32's first byte uses
 * bit7 = SIGN and bit6 = "has more", NOT the other way around.
 */

const UE2_TAG = 0x9e2a83c1;
const UE2_TAG_BYTES = [0xc1, 0x83, 0x2a, 0x9e];
const RF_HAS_STACK = 0x02000000;

// Property type ids (info & 0x0F)
const PT_BOOL = 0x3;
const PT_STRUCT = 0xa;
// size code (info & 0x70) → bytes
const STATIC_SIZES: Record<number, number> = { 0x00: 1, 0x10: 2, 0x20: 4, 0x30: 12, 0x40: 16 };

export interface UName {
  name: string;
  flags: number;
}
export interface UImport {
  classPackage: string;
  className: string;
  objectName: string;
  outer: number; // package/outer object reference (negative → another import)
}
export interface UExport {
  idClass: number;
  idObjectName: number;
  className: string; // resolved (import name / "Class" / "(exp)")
  objectName: string;
  flags: number;
  size: number;
  offset: number;
}
export type L2TextureFormat = "DXT1" | "DXT3" | "DXT5" | "RGBA8" | "P8" | "G16" | "unknown";
export interface L2Texture {
  name: string;
  width: number;
  height: number;
  format: L2TextureFormat;
  /** Top-mip pixel data. For DXT* this is the compressed block data (upload as CompressedTexture). */
  data: Uint8Array;
}
export interface StaticMeshGeometry {
  name: string;
  positions: Float32Array; // xyz per vertex
  normals: Float32Array; // xyz per vertex
  indices: Uint16Array; // triangle indices
  vertexCount: number;
  triangleCount: number;
}
export interface ActorPlacement {
  className: string;
  name: string;
  x: number;
  y: number;
  z: number;
  scale: number; // DrawScale (uniform), default 1
}

/** A StaticMeshActor placement with its mesh reference + full transform. */
export interface MapPlacement {
  x: number;
  y: number;
  z: number;
  /** UE rotator components in radians (already converted from 0..65535). */
  pitch: number;
  yaw: number;
  roll: number;
  scale: number; // DrawScale
  scale3d: [number, number, number]; // DrawScale3D (default 1,1,1)
  mesh: string; // StaticMesh object name
  pkg: string; // package (.usx) that holds the mesh
}

// ── low level reads ──
function readCompat32(b: Uint8Array, off: number): [number, number] {
  let b0 = b[off];
  const sign = b0 & 0x80;
  let val = b0 & 0x3f;
  let size = 1;
  if (b0 & 0x40) {
    let shift = 6;
    for (;;) {
      const bb = b[off + size];
      size++;
      val |= (bb & 0x7f) << shift;
      shift += 7;
      if (!(bb & 0x80)) break;
      if (size >= 5) break;
    }
  }
  return [sign ? -val : val, size];
}

export class L2Package {
  readonly bytes: Uint8Array; // decrypted UE2 data (28-byte L2 header stripped)
  readonly dv: DataView;
  signature = "";
  version = -1;
  encryption: "none" | "xor" | "rsa" = "none";
  xorKey = 0;
  packageVersion = 0;
  names: UName[] = [];
  imports: UImport[] = [];
  exports: UExport[] = [];

  private constructor(decrypted: Uint8Array) {
    this.bytes = decrypted;
    this.dv = new DataView(decrypted.buffer, decrypted.byteOffset, decrypted.byteLength);
  }

  /** Build from raw file bytes (handles signature + decryption). RSA path needs gmp (see decryptRsaEncdec). */
  static from(buf: ArrayBuffer): L2Package {
    const raw = new Uint8Array(buf);
    // signature (28 bytes UTF-16LE)
    let sig = "";
    for (let i = 0; i < 14; i++) sig += String.fromCharCode(raw[i * 2] | (raw[i * 2 + 1] << 8));
    const vm = sig.match(/Lineage2Ver(\d+)/i);
    const version = vm ? parseInt(vm[1], 10) : -1;

    // already plaintext?
    if (raw.length >= 4 && (raw[0] | (raw[1] << 8) | (raw[2] << 16) | (raw[3] << 24)) >>> 0 === UE2_TAG) {
      const p = new L2Package(raw);
      p.signature = sig;
      p.version = version;
      p.encryption = "none";
      p.parse();
      return p;
    }

    // XOR modulo: derive single-byte key from the magic (bulletproof)
    const hs = 28;
    const key = raw[hs] ^ UE2_TAG_BYTES[0];
    const magicOk = [0, 1, 2, 3].every((i) => (raw[hs + i] ^ key) === UE2_TAG_BYTES[i]);
    if (!magicOk) {
      throw new Error(
        `Not plaintext and XOR magic mismatch (version ${version}). This is likely an RSA "encdec" package — decrypt with decryptRsaEncdec() first, then new L2Package(decryptedBytes).`,
      );
    }
    const dec = new Uint8Array(raw.length - hs);
    for (let i = 0; i < dec.length; i++) dec[i] = raw[hs + i] ^ key;
    const p = new L2Package(dec);
    p.signature = sig;
    p.version = version;
    p.encryption = "xor";
    p.xorKey = key;
    p.parse();
    return p;
  }

  /** Build directly from already-decrypted UE2 bytes (e.g. after RSA). */
  static fromDecrypted(bytes: Uint8Array): L2Package {
    const p = new L2Package(bytes);
    p.parse();
    return p;
  }

  parse() {
    const dv = this.dv;
    const tag = dv.getUint32(0, true);
    if (tag !== UE2_TAG) throw new Error(`UE2 tag mismatch 0x${tag.toString(16)}`);
    this.packageVersion = dv.getUint16(4, true);
    const nameCount = dv.getUint32(12, true);
    const nameOffset = dv.getUint32(16, true);
    const exportCount = dv.getUint32(20, true);
    const exportOffset = dv.getUint32(24, true);
    const importCount = dv.getUint32(28, true);
    const importOffset = dv.getUint32(32, true);

    // names: compat32 length + ascii(len-1) + uint32 flags
    const b = this.bytes;
    let o = nameOffset;
    for (let i = 0; i < nameCount; i++) {
      const [len, s] = readCompat32(b, o);
      o += s;
      let nm = "";
      if (len > 0) {
        for (let c = 0; c < len - 1; c++) nm += String.fromCharCode(b[o + c]);
        o += len;
      }
      const flags = dv.getUint32(o, true);
      o += 4;
      this.names.push({ name: nm, flags });
    }

    // imports: classPackage(ci name), className(ci name), package(int32), objectName(ci name)
    o = importOffset;
    for (let i = 0; i < importCount; i++) {
      const [cp, s1] = readCompat32(b, o);
      o += s1;
      const [cn, s2] = readCompat32(b, o);
      o += s2;
      const outer = dv.getInt32(o, true);
      o += 4; // package/outer int32
      const [on, s3] = readCompat32(b, o);
      o += s3;
      this.imports.push({
        classPackage: this.nm(cp),
        className: this.nm(cn),
        objectName: this.nm(on),
        outer,
      });
    }

    // exports: class(ci) super(ci) package(int32) objectName(ci) flags(u32) size(ci) [offset(ci) if size>0]
    o = exportOffset;
    for (let i = 0; i < exportCount; i++) {
      const [cls, s1] = readCompat32(b, o);
      o += s1;
      o += readCompat32(b, o)[1]; // super
      o += 4; // package int32
      const [on, s4] = readCompat32(b, o);
      o += s4;
      const flags = dv.getUint32(o, true);
      o += 4;
      const [size, s5] = readCompat32(b, o);
      o += s5;
      let offset = 0;
      if (size > 0) {
        const [off2, s6] = readCompat32(b, o);
        o += s6;
        offset = off2;
      }
      let className: string;
      if (cls < 0) className = this.imports[-cls - 1]?.objectName ?? "?";
      else if (cls > 0) className = this.exports[cls - 1]?.objectName ?? "(exp)";
      else className = "Class";
      this.exports.push({ idClass: cls, idObjectName: on, className, objectName: this.nm(on), flags, size, offset });
    }
  }

  private nm(i: number): string {
    return i >= 0 && i < this.names.length ? this.names[i].name : "?";
  }

  /** Find an export by object name (e.g. a StaticMesh). */
  findExport(name: string): UExport | undefined {
    return this.exports.find((e) => e.objectName === name);
  }

  /** Resolve an object reference (compat32): <0 import, >0 export → {name, pkg}. */
  private resolveRef(idx: number): { name: string; pkg: string } {
    if (idx < 0) {
      const imp = this.imports[-idx - 1];
      if (!imp) return { name: "?", pkg: "?" };
      // walk outer chain to the top import (the package name)
      let o = imp.outer;
      let pkg = "?";
      for (let i = 0; i < 8 && o < 0; i++) {
        const p = this.imports[-o - 1];
        if (!p) break;
        pkg = p.objectName;
        o = p.outer;
      }
      return { name: imp.objectName, pkg };
    }
    if (idx > 0) return { name: this.exports[idx - 1]?.objectName ?? "?", pkg: "(this)" };
    return { name: "", pkg: "" };
  }

  /**
   * StaticMeshActor placements with their mesh reference + transform.
   * Validated against real client maps (17_25.unr Ertheia: 2081 actors).
   */
  readMapPlacements(): MapPlacement[] {
    const out: MapPlacement[] = [];
    for (const e of this.exports) {
      if (e.size <= 0) continue;
      if (
        e.className !== "StaticMeshActor" &&
        e.className !== "L2MovableStaticMeshActor" &&
        e.className !== "MovableStaticMeshActor"
      )
        continue;
      const p = this.readProps(e);
      const loc = p.Location as [number, number, number] | undefined;
      const ref = p.StaticMesh as number | undefined;
      if (!loc || ref === undefined) continue;
      const { name, pkg } = this.resolveRef(ref);
      if (!name || name === "?") continue;
      const rot = (p.Rotation as [number, number, number]) ?? [0, 0, 0];
      const TWO_PI_OVER_65536 = (Math.PI * 2) / 65536;
      const s3 = (p.DrawScale3D as [number, number, number]) ?? [1, 1, 1];
      out.push({
        x: loc[0],
        y: loc[1],
        z: loc[2],
        pitch: rot[0] * TWO_PI_OVER_65536,
        yaw: rot[1] * TWO_PI_OVER_65536,
        roll: rot[2] * TWO_PI_OVER_65536,
        scale: (p.DrawScale as number) ?? 1,
        scale3d: s3,
        mesh: name,
        pkg,
      });
    }
    return out;
  }

  /**
   * Read a Texture's top mipmap → {width, height, format, data}.
   * Validated against Aden_blazingswampstone_T.utx (lavastone2 DXT3 decoded).
   * UE2 format ids: 0=P8 3=DXT1 5=RGBA8 7=DXT3 8=DXT5 10=G16.
   * The L2 mip container has a "0x100" lazy-storage quirk, so we locate the top
   * mip robustly: its byte length = USize*VSize (×bpp), found as a compat32 in
   * the serial range. Returns compressed DXT data for a three.js CompressedTexture.
   */
  readTexture(nameOrExport: string | UExport): L2Texture | null {
    const e = typeof nameOrExport === "string" ? this.findExport(nameOrExport) : nameOrExport;
    if (!e || e.size <= 0) return null;
    const b = this.bytes;
    const dv = this.dv;
    const cur = { o: e.offset };
    const ci = () => {
      const [v, s] = readCompat32(b, cur.o);
      cur.o += s;
      return v;
    };
    const u8 = () => b[cur.o++];
    const u16 = () => {
      const v = dv.getUint16(cur.o, true);
      cur.o += 2;
      return v;
    };

    if (e.flags & RF_HAS_STACK) {
      const nid = ci();
      ci();
      cur.o += 12;
      if (nid !== 0) ci();
    }

    let fmtId = -1,
      uSize = 0,
      vSize = 0,
      guard = 0;
    for (;;) {
      if (guard++ > 400) break;
      const ni = ci();
      const nm = this.nm(ni);
      if (nm === "None") break;
      const info = u8();
      const ptype = info & 0x0f,
        szc = info & 0x70,
        isArray = info & 0x80;
      if (ptype === PT_STRUCT) ci();
      let dsz: number;
      if (szc in STATIC_SIZES) dsz = STATIC_SIZES[szc];
      else if (szc === 0x50) dsz = u8();
      else if (szc === 0x60) dsz = u16();
      else if (szc === 0x70) {
        dsz = dv.getUint32(cur.o, true);
        cur.o += 4;
      } else dsz = 0;
      if (isArray && ptype !== PT_BOOL) u8();
      if (ptype === PT_BOOL) continue;
      if (nm === "Format") fmtId = b[cur.o];
      else if (nm === "USize") uSize = dv.getInt32(cur.o, true);
      else if (nm === "VSize") vSize = dv.getInt32(cur.o, true);
      cur.o += dsz;
    }

    const fmtMap: Record<number, L2TextureFormat> = { 0: "P8", 3: "DXT1", 5: "RGBA8", 7: "DXT3", 8: "DXT5", 10: "G16" };
    const format = fmtMap[fmtId] ?? "unknown";
    if (!uSize || !vSize) return null;
    const bpp = format === "DXT1" ? 0.5 : format === "RGBA8" ? 4 : format === "G16" ? 2 : 1;
    const topLen = Math.floor(uSize * vSize * bpp);

    const end = e.offset + e.size;
    let dataOff = -1;
    for (let o = cur.o; o < end - 8; o++) {
      const [v, s] = readCompat32(b, o);
      if (v === topLen && o + s + topLen <= end) {
        dataOff = o + s;
        break;
      }
    }
    if (dataOff < 0) return null;
    return { name: e.objectName, width: uSize, height: vSize, format, data: b.slice(dataOff, dataOff + topLen) };
  }

  /**
   * Read a StaticMesh's geometry → {positions, normals, indices}.
   * Validated against Dethrone_V_S.usx (house/railing/torch all correct).
   * Layout: [stack] props → FBox(25)+FPlane(16) → sections → FBox(25)
   *         → vertexStream(pos+normal) → color → alpha → uvStreams → indexStream.
   */
  readStaticMesh(nameOrExport: string | UExport): StaticMeshGeometry | null {
    const e = typeof nameOrExport === "string" ? this.findExport(nameOrExport) : nameOrExport;
    if (!e || e.size <= 0 || e.className !== "StaticMesh") return null;
    const b = this.bytes;
    const dv = this.dv;
    const cur = { o: e.offset };
    const ci = () => {
      const [v, s] = readCompat32(b, cur.o);
      cur.o += s;
      return v;
    };
    const u8 = () => b[cur.o++];
    const u16 = () => {
      const v = dv.getUint16(cur.o, true);
      cur.o += 2;
      return v;
    };
    const skip = (n: number) => {
      cur.o += n;
    };

    if (e.flags & RF_HAS_STACK) {
      const nid = ci();
      ci();
      skip(12); // stateNode, probeMask(8)+latent(4)
      if (nid !== 0) ci();
    }
    // tagged properties → None
    let guard = 0;
    for (;;) {
      if (guard++ > 400) break;
      const ni = ci();
      if (this.nm(ni) === "None") break;
      const info = u8();
      const ptype = info & 0x0f,
        szc = info & 0x70,
        isArray = info & 0x80;
      if (ptype === PT_STRUCT) ci();
      let dsz: number;
      if (szc in STATIC_SIZES) dsz = STATIC_SIZES[szc];
      else if (szc === 0x50) dsz = u8();
      else if (szc === 0x60) dsz = u16();
      else if (szc === 0x70) {
        dsz = dv.getUint32(cur.o, true);
        cur.o += 4;
      } else dsz = 0;
      if (isArray && ptype !== PT_BOOL) u8();
      if (ptype === PT_BOOL) continue;
      skip(dsz);
    }
    skip(25);
    skip(16); // UPrimitive: FBox + FPlane
    const nsec = ci();
    skip(nsec * 14); // FStaticMeshSection[]
    skip(25); // boundingBox FBox

    const V = ci();
    const vbase = cur.o;
    const positions = new Float32Array(V * 3);
    const normals = new Float32Array(V * 3);
    for (let i = 0; i < V; i++) {
      const o = vbase + i * 24;
      positions[i * 3] = dv.getFloat32(o, true);
      positions[i * 3 + 1] = dv.getFloat32(o + 4, true);
      positions[i * 3 + 2] = dv.getFloat32(o + 8, true);
      normals[i * 3] = dv.getFloat32(o + 12, true);
      normals[i * 3 + 1] = dv.getFloat32(o + 16, true);
      normals[i * 3 + 2] = dv.getFloat32(o + 20, true);
    }
    skip(V * 24);
    skip(4); // + revision
    const nc = ci();
    skip(nc * 4);
    skip(4); // colorStream
    const na = ci();
    skip(na * 4);
    skip(4); // alphaStream
    const nuv = ci();
    for (let i = 0; i < nuv; i++) {
      const us = ci();
      skip(us * 8);
      skip(8);
    } // uvStream + 2×int32

    const I = ci();
    const ibase = cur.o;
    const indices = new Uint16Array(I);
    for (let i = 0; i < I; i++) indices[i] = dv.getUint16(ibase + i * 2, true);

    return { name: e.objectName, positions, normals, indices, vertexCount: V, triangleCount: (I / 3) | 0 };
  }

  /** Histogram of export class names — quick "what's in this map". */
  classHistogram(): Record<string, number> {
    const h: Record<string, number> = {};
    for (const e of this.exports) h[e.className] = (h[e.className] ?? 0) + 1;
    return h;
  }

  /**
   * Extract placed-actor positions (Location/DrawScale) for the given classes.
   * Default classes cover the visible world geometry of an L2 map.
   */
  readActorPlacements(
    classes: string[] = ["StaticMeshActor", "L2MovableStaticMeshActor", "MovableStaticMeshActor"],
  ): ActorPlacement[] {
    const want = new Set(classes);
    const out: ActorPlacement[] = [];
    for (const e of this.exports) {
      if (!want.has(e.className) || e.size <= 0) continue;
      const props = this.readProps(e);
      const loc = props.Location as [number, number, number] | undefined;
      if (!loc) continue;
      const scale = (props.DrawScale as number) ?? 1;
      out.push({ className: e.className, name: e.objectName, x: loc[0], y: loc[1], z: loc[2], scale });
    }
    return out;
  }

  /** Read tagged properties of one export's serial data (skips the RF_HasStack frame). */
  private readProps(e: UExport): Record<string, unknown> {
    const b = this.bytes;
    const dv = this.dv;
    let o = e.offset;
    const end = e.offset + e.size;

    if (e.flags & RF_HAS_STACK) {
      const [nid, s1] = readCompat32(b, o);
      o += s1;
      o += readCompat32(b, o)[1]; // stateNode
      o += 8; // probeMask int64
      o += 4; // latentAction int32
      if (nid !== 0) o += readCompat32(b, o)[1]; // offset
    }

    const props: Record<string, unknown> = {};
    let guard = 0;
    while (o < end && guard++ < 400) {
      const [ni, s] = readCompat32(b, o);
      o += s;
      const nm = this.nm(ni);
      if (nm === "None") break;
      const info = b[o];
      o += 1;
      const ptype = info & 0x0f;
      const szc = info & 0x70;
      const isArray = info & 0x80;
      if (ptype === PT_STRUCT) o += readCompat32(b, o)[1]; // struct name
      let dsz: number;
      if (szc in STATIC_SIZES) dsz = STATIC_SIZES[szc];
      else if (szc === 0x50) {
        dsz = b[o];
        o += 1;
      } else if (szc === 0x60) {
        dsz = dv.getUint16(o, true);
        o += 2;
      } else if (szc === 0x70) {
        dsz = dv.getUint32(o, true);
        o += 4;
      } else dsz = 0;
      if (isArray && ptype !== PT_BOOL) o += 1; // (simplified array index)
      if (ptype === PT_BOOL) {
        props[nm] = !!isArray;
        continue;
      }
      if ((nm === "Location" || nm === "DrawScale3D") && dsz >= 12) {
        props[nm] = [dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true)];
      } else if (nm === "Rotation" && dsz >= 12) {
        props[nm] = [dv.getInt32(o, true), dv.getInt32(o + 4, true), dv.getInt32(o + 8, true)];
      } else if (nm === "DrawScale" && dsz === 4) {
        props[nm] = dv.getFloat32(o, true);
      } else if (nm === "StaticMesh") {
        props[nm] = readCompat32(b, o)[0]; // object ref (compat32)
      }
      o += dsz;
    }
    return props;
  }
}

/**
 * RSA "encdec" decryption for ver 413+ packages (ported from Lineage2JS).
 * `gmp` = await (await import("gmp-wasm")).init(); needs pako too.
 * Returns decrypted UE2 bytes → pass to L2Package.fromDecrypted().
 */
export async function decryptRsaEncdec(encoded: Uint8Array, gmpLib: unknown): Promise<Uint8Array> {
  const { Inflate } = await import("pako");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gmp = gmpLib as any;
  const MOD =
    "75b4d6de5c016544068a1acf125869f43d2e09fc55b8b1e289556daf9b8757635593446288b3653da1ce91c87bb1a5c18f16323495c55d7d72c0890a83f69bfd1fd9434eb1c02f3e4679edfa43309319070129c267c85604d87bb65bae205de3707af1d2108881abb567c3b3d069ae67c3a4c6a3aa93d26413d4c66094ae2039";
  const EXP = 0x1d,
    BLOCK = 128;
  const rop = gmp.binding.mpq_t();
  gmp.binding.mpq_init(rop);
  const mod = gmp.binding.mpz_t();
  const pMod = gmp.binding.malloc_cstr(MOD);
  gmp.binding.mpz_init_set_str(mod, pMod, 16);
  gmp.binding.free(pMod);
  const base = gmp.binding.mpz_t();
  let readOffset = 0,
    position = 0,
    size = 0,
    startPosition = 0,
    buffer = new Uint8Array(0);
  const fill = (): boolean => {
    if (position !== size) return true;
    if (readOffset + BLOCK >= encoded.length) return false;
    const blk = encoded.slice(readOffset, readOffset + BLOCK);
    const bs = [...blk].map((x) => ("0" + x.toString(16)).slice(-2)).join("");
    const pBase = gmp.binding.malloc_cstr(bs);
    gmp.binding.mpz_init_set_str(base, pBase, 16);
    gmp.binding.mpz_powm_ui(rop, base, EXP, mod);
    gmp.binding.free(pBase);
    const rs = ("0".repeat(bs.length) + gmp.binding.mpz_to_string(rop, 16)).slice(-bs.length);
    buffer = new Uint8Array(rs.match(/.{2}/g)!.map((x) => parseInt(x, 16)));
    size = buffer[3] & 0xff;
    startPosition = BLOCK - size - ((BLOCK - 4 - size) % 4);
    position = 0;
    readOffset = readOffset + startPosition + size;
    return true;
  };
  fill();
  position += 4; // skip archive size
  const inflator = new Inflate({ raw: false });
  while (fill()) {
    const val = new Uint8Array(size - position);
    for (let i = position, j = 0; i < size; i++, j++) val[j] = buffer[startPosition + position++] & 0xff;
    inflator.push(val);
  }
  gmp.binding.free(rop);
  gmp.binding.free(mod);
  gmp.binding.free(base);
  return inflator.result as Uint8Array;
}
