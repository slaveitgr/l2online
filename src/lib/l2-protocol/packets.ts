/**
 * Little-endian packet reader/writer for the Lineage 2 protocol.
 * All multi-byte integers are LE. Strings are UCS-2 LE, null-terminated.
 */

export class PacketWriter {
  private buf: number[] = [];

  bytes(b: Uint8Array): this {
    for (const x of b) this.buf.push(x & 0xff);
    return this;
  }
  u8(n: number): this {
    this.buf.push(n & 0xff);
    return this;
  }
  u16(n: number): this {
    this.buf.push(n & 0xff, (n >>> 8) & 0xff);
    return this;
  }
  u32(n: number): this {
    this.buf.push(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff);
    return this;
  }
  /** UCS-2 LE, null terminated. */
  str(s: string): this {
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      this.buf.push(c & 0xff, (c >>> 8) & 0xff);
    }
    this.buf.push(0, 0);
    return this;
  }
  padTo(n: number): this {
    while (this.buf.length < n) this.buf.push(0);
    return this;
  }
  build(): Uint8Array {
    return new Uint8Array(this.buf);
  }
}

export class PacketReader {
  private off = 0;
  constructor(private data: Uint8Array) {}
  get remaining(): number {
    return this.data.length - this.off;
  }
  u8(): number {
    return this.data[this.off++];
  }
  u16(): number {
    const v = this.data[this.off] | (this.data[this.off + 1] << 8);
    this.off += 2;
    return v >>> 0;
  }
  u32(): number {
    const v =
      this.data[this.off] |
      (this.data[this.off + 1] << 8) |
      (this.data[this.off + 2] << 16) |
      (this.data[this.off + 3] << 24);
    this.off += 4;
    return v >>> 0;
  }
  bytes(n: number): Uint8Array {
    const out = this.data.slice(this.off, this.off + n);
    this.off += n;
    return out;
  }
  str(): string {
    let s = "";
    for (;;) {
      if (this.off + 1 >= this.data.length) break;
      const c = this.data[this.off] | (this.data[this.off + 1] << 8);
      this.off += 2;
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  }
  skip(n: number): void {
    this.off += n;
  }
}

/**
 * Append an XOR checksum (4-byte LE) to a Blowfish-aligned packet body and
 * pad the whole thing to a multiple of 8. Body length BEFORE this call should
 * already include the opcode and any payload.
 */
export function appendChecksumAndPad(body: Uint8Array): Uint8Array {
  // Reserve 4 bytes for checksum, then pad to multiple of 8.
  const minLen = body.length + 4;
  const padded = (minLen + 7) & ~7;
  const out = new Uint8Array(padded);
  out.set(body);
  // checksum over all u32 words BEFORE the checksum slot
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  let chk = 0 >>> 0;
  const wordsBeforeChk = (padded - 4) >>> 2;
  for (let i = 0; i < wordsBeforeChk; i++) {
    chk = (chk ^ view.getUint32(i * 4, true)) >>> 0;
  }
  view.setUint32(padded - 4, chk, true);
  return out;
}

/**
 * Verify an incoming packet body's XOR checksum. Returns true if it matches.
 * The L2 checksum format places the checksum in the last u32 word.
 */
export function verifyChecksum(body: Uint8Array): boolean {
  if (body.length < 8 || body.length % 4 !== 0) return false;
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  let chk = 0 >>> 0;
  const wordsBeforeChk = (body.length - 4) >>> 2;
  for (let i = 0; i < wordsBeforeChk; i++) {
    chk = (chk ^ view.getUint32(i * 4, true)) >>> 0;
  }
  return view.getUint32(body.length - 4, true) === chk;
}

/**
 * Undo `NewCrypt.encXORPass` (L2J). Forward algorithm:
 *
 *   ecx = key
 *   for pos in 4..size-8 step 4:
 *     edx_orig = read_u32(pos)
 *     ecx += edx_orig
 *     write_u32(pos, edx_orig ^ ecx)
 *   write_u32(size-8, ecx)   // final accumulator
 *
 * Inverse — walk BACKWARDS, accumulator known (read from size-8):
 *
 *   ecx = read_u32(size-8)
 *   for pos in (size-12) .. 4 step -4:
 *     edx_enc = read_u32(pos)
 *     edx_orig = edx_enc ^ ecx
 *     ecx -= edx_orig
 *     write_u32(pos, edx_orig)
 *
 * Operates in place on `buf` between bytes [offset, offset+size).
 */
export function decXORPass(buf: Uint8Array, offset: number, size: number): void {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let ecx = view.getUint32(offset + size - 8, true);
  for (let pos = offset + size - 12; pos >= offset + 4; pos -= 4) {
    const edxEnc = view.getUint32(pos, true);
    const edxOrig = (edxEnc ^ ecx) >>> 0;
    ecx = (ecx - edxOrig) >>> 0;
    view.setUint32(pos, edxOrig, true);
  }
}

