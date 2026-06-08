/**
 * UE2 name-table decoder for L2 packages (ver133 / lic40).
 *
 * Names are length-prefixed strings using UE2 "compact32" (signed compact
 * integer) length. CRITICAL: in the L2 ver133/lic40 build, the SIGN bit of
 * the compact length encodes string width:
 *
 *   sign bit SET  → UTF-16LE, byte length = abs(len) * 2 (includes NUL).
 *   sign bit CLR  → ASCII / Latin-1, byte length = len (includes NUL).
 *
 * Missing this branch corrupts every subsequent name read.
 *
 * After the string, the entry has a u32 (sometimes u64) name flags field.
 * For our purpose we only need the string + flags-skip.
 */

export interface NameEntry {
  name: string;
  flags: bigint;
}

export class BinaryReader {
  view: DataView;
  pos = 0;
  constructor(public buf: ArrayBuffer, offset = 0, length?: number) {
    this.view = new DataView(buf, offset, length ?? buf.byteLength - offset);
  }
  get remaining() { return this.view.byteLength - this.pos; }
  seek(p: number) { this.pos = p; }
  u8()  { const v = this.view.getUint8(this.pos); this.pos += 1; return v; }
  u16() { const v = this.view.getUint16(this.pos, true); this.pos += 2; return v; }
  u32() { const v = this.view.getUint32(this.pos, true); this.pos += 4; return v; }
  i32() { const v = this.view.getInt32(this.pos, true); this.pos += 4; return v; }
  u64() { const v = this.view.getBigUint64(this.pos, true); this.pos += 8; return v; }
  f32() { const v = this.view.getFloat32(this.pos, true); this.pos += 4; return v; }
  bytes(n: number) {
    const out = new Uint8Array(this.view.buffer, this.view.byteOffset + this.pos, n);
    this.pos += n;
    return out;
  }

  /**
   * Read a UE2 compact-signed integer. Returns the signed value; callers
   * inspect the sign bit separately via the helper readCompactWithSign.
   */
  compactSigned(): number {
    let b = this.u8();
    const sign = (b & 0x80) !== 0;
    let v = b & 0x3f;
    let more = (b & 0x40) !== 0;
    let shift = 6;
    while (more && shift < 32) {
      b = this.u8();
      more = (b & 0x80) !== 0;
      v |= (b & 0x7f) << shift;
      shift += 7;
    }
    return sign ? -v : v;
  }
}

/**
 * Read one length-prefixed name string at the current cursor.
 * Returns the decoded string (NUL stripped).
 */
export function readSizedString(r: BinaryReader): string {
  const lenRaw = r.compactSigned();
  if (lenRaw === 0) return "";
  if (lenRaw < 0) {
    // UTF-16LE, |lenRaw| code units including NUL.
    const units = -lenRaw;
    const bytes = r.bytes(units * 2);
    let s = "";
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i < units; i++) {
      const cu = dv.getUint16(i * 2, true);
      if (cu === 0) continue;
      s += String.fromCharCode(cu);
    }
    return s;
  }
  // ASCII / Latin-1, lenRaw bytes including NUL.
  const bytes = r.bytes(lenRaw);
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    if (c === 0) continue;
    s += String.fromCharCode(c);
  }
  return s;
}

export function readNameTable(
  buf: ArrayBuffer,
  nameOffset: number,
  nameCount: number,
): NameEntry[] {
  const r = new BinaryReader(buf, 0);
  r.seek(nameOffset);
  const out: NameEntry[] = new Array(nameCount);
  for (let i = 0; i < nameCount; i++) {
    const name = readSizedString(r);
    // Name flags — try 64-bit then fall back to 32-bit if the package is
    // pre-largeFlags. We assume 64-bit for ver≥123; ver133 qualifies.
    const flags = r.u64();
    out[i] = { name, flags };
  }
  return out;
}
