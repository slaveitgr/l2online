/**
 * Blowfish ECB implementation tuned for the Lineage 2 protocol.
 *
 * L2 uses Blowfish in ECB mode on 8-byte blocks. The login server picks a
 * random 16-byte key during the Init packet and from that point on every
 * packet body (after the 2-byte length prefix) is Blowfish-encrypted before
 * being sent over TCP, and decrypted on the way back.
 *
 * Reference: standard Blowfish (Schneier 1993) — same P-array and S-box
 * initial constants used by L2J's `NewCrypt` class.
 */

// P-array and S-boxes are big — kept in a separate constants module to keep
// this file readable.
import { P_INIT, S_INIT } from "./blowfish-constants";

export class Blowfish {
  private P: Uint32Array;
  private S: Uint32Array; // 4 * 256, flat

  constructor(key: Uint8Array) {
    this.P = new Uint32Array(P_INIT);
    this.S = new Uint32Array(S_INIT);
    if (key.length === 0) throw new Error("Blowfish key must be non-empty");

    // Key schedule: XOR P-array with cyclic key bytes (big-endian u32 chunks).
    let j = 0;
    for (let i = 0; i < 18; i++) {
      let data = 0 >>> 0;
      for (let k = 0; k < 4; k++) {
        data = ((data << 8) | key[j]) >>> 0;
        j = (j + 1) % key.length;
      }
      this.P[i] = (this.P[i] ^ data) >>> 0;
    }

    let l = 0,
      r = 0;
    for (let i = 0; i < 18; i += 2) {
      [l, r] = this.encryptBlock(l, r);
      this.P[i] = l;
      this.P[i + 1] = r;
    }
    for (let s = 0; s < 4; s++) {
      for (let i = 0; i < 256; i += 2) {
        [l, r] = this.encryptBlock(l, r);
        this.S[s * 256 + i] = l;
        this.S[s * 256 + i + 1] = r;
      }
    }
  }

  private F(x: number): number {
    const a = (x >>> 24) & 0xff;
    const b = (x >>> 16) & 0xff;
    const c = (x >>> 8) & 0xff;
    const d = x & 0xff;
    const S = this.S;
    return ((((S[a] + S[256 + b]) >>> 0) ^ S[512 + c]) + S[768 + d]) >>> 0;
  }

  private encryptBlock(l: number, r: number): [number, number] {
    for (let i = 0; i < 16; i++) {
      l = (l ^ this.P[i]) >>> 0;
      r = (r ^ this.F(l)) >>> 0;
      const t = l;
      l = r;
      r = t;
    }
    const t = l;
    l = r;
    r = t;
    r = (r ^ this.P[16]) >>> 0;
    l = (l ^ this.P[17]) >>> 0;
    return [l >>> 0, r >>> 0];
  }

  private decryptBlock(l: number, r: number): [number, number] {
    for (let i = 17; i > 1; i--) {
      l = (l ^ this.P[i]) >>> 0;
      r = (r ^ this.F(l)) >>> 0;
      const t = l;
      l = r;
      r = t;
    }
    const t = l;
    l = r;
    r = t;
    r = (r ^ this.P[1]) >>> 0;
    l = (l ^ this.P[0]) >>> 0;
    return [l >>> 0, r >>> 0];
  }

  /** Encrypt in-place across 8-byte blocks (length must be multiple of 8). */
  encrypt(data: Uint8Array): Uint8Array {
    if (data.length % 8 !== 0) throw new Error(`Blowfish encrypt length must be multiple of 8, got ${data.length}`);
    const out = new Uint8Array(data);
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    for (let i = 0; i < out.length; i += 8) {
      const l = view.getUint32(i, true);
      const r = view.getUint32(i + 4, true);
      const [el, er] = this.encryptBlock(l, r);
      view.setUint32(i, el, true);
      view.setUint32(i + 4, er, true);
    }
    return out;
  }

  /** Decrypt in-place across 8-byte blocks (length must be multiple of 8). */
  decrypt(data: Uint8Array): Uint8Array {
    if (data.length % 8 !== 0) throw new Error(`Blowfish decrypt length must be multiple of 8, got ${data.length}`);
    const out = new Uint8Array(data);
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    for (let i = 0; i < out.length; i += 8) {
      const l = view.getUint32(i, true);
      const r = view.getUint32(i + 4, true);
      const [dl, dr] = this.decryptBlock(l, r);
      view.setUint32(i, dl, true);
      view.setUint32(i + 4, dr, true);
    }
    return out;
  }
}
