/**
 * L2 Game Server stream cipher (a.k.a. "GameCrypt" / NewCrypt).
 *
 * Not Blowfish — every byte is XORed with the previous plaintext byte and the
 * corresponding byte of a 16-byte rotating key. After each en/decrypt call,
 * bytes [8..11] of the key are advanced by `size` (little-endian add).
 *
 * The key is built from the 8-byte session key sent by the server in
 * KeyPacket, padded with the static suffix below (l2jmobius
 * `gameserver/network/GameClientEncryption.STATIC_KEY_SUFFIX`).
 */
export const GAME_KEY_SUFFIX = new Uint8Array([
  0xc8, 0x27, 0x93, 0x01, 0xa1, 0x6c, 0x31, 0x97,
]);

export class GameCrypt {
  private inKey: Uint8Array;
  private outKey: Uint8Array;

  constructor(seed8: Uint8Array) {
    if (seed8.length !== 8) throw new Error("GameCrypt seed must be 8 bytes");
    this.inKey = new Uint8Array(16);
    this.outKey = new Uint8Array(16);
    this.inKey.set(seed8, 0);
    this.inKey.set(GAME_KEY_SUFFIX, 8);
    this.outKey.set(seed8, 0);
    this.outKey.set(GAME_KEY_SUFFIX, 8);
  }

  decrypt(data: Uint8Array): Uint8Array {
    const out = new Uint8Array(data);
    let temp = 0;
    for (let i = 0; i < out.length; i++) {
      const t2 = out[i] & 0xff;
      out[i] = (t2 ^ this.inKey[i & 15] ^ temp) & 0xff;
      temp = t2;
    }
    this.advance(this.inKey, out.length);
    return out;
  }

  encrypt(data: Uint8Array): Uint8Array {
    const out = new Uint8Array(data);
    let temp = 0;
    for (let i = 0; i < out.length; i++) {
      const t2 = (out[i] ^ this.outKey[i & 15] ^ temp) & 0xff;
      out[i] = t2;
      temp = t2;
    }
    this.advance(this.outKey, out.length);
    return out;
  }

  private advance(key: Uint8Array, size: number) {
    let old = (key[8] | (key[9] << 8) | (key[10] << 16) | (key[11] << 24)) >>> 0;
    old = (old + size) >>> 0;
    key[8] = old & 0xff;
    key[9] = (old >>> 8) & 0xff;
    key[10] = (old >>> 16) & 0xff;
    key[11] = (old >>> 24) & 0xff;
  }
}
