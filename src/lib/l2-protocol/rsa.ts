/**
 * Modified RSA-1024 used by the Lineage 2 login protocol.
 *
 * - Server sends a 128-byte modulus in the Init packet. Public exponent is
 *   always 65537. The modulus is sent "scrambled": indices [0x00..0x04] are
 *   XORed with indices [0x4d..0x50] before transmission so that the leading
 *   byte ends up 0x00. We undo that scramble before doing modPow.
 * - Encryption is "raw" RSA (no PKCS#1 padding). The client builds a 128-byte
 *   plaintext block with the credential bytes packed at specific offsets and
 *   the rest zero, then computes plain^65537 mod n.
 */

function bytesToBigInt(b: Uint8Array): bigint {
  let n = 0n;
  for (const byte of b) n = (n << 8n) | BigInt(byte);
  return n;
}

function bigIntToBytes(n: bigint, len: number): Uint8Array {
  const out = new Uint8Array(len);
  for (let i = len - 1; i >= 0; i--) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return out;
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  base = base % mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return result;
}

/**
 * Undo the L2 scramble: swap nibble pairs at fixed positions so the modulus
 * becomes a real 1024-bit big-endian integer.
 *
 * The scramble used by NCSoft (and verified by every open-source L2J client):
 *   for i in 0..3:  scrambled[0x00 + i] ^= scrambled[0x4d + i]
 *   for i in 0..3:  swap scrambled[0x00 + i] <-> scrambled[0x4d + i]  (no — see code)
 *
 * Implementation here follows the L2J `ScrambledKeyPair` inverse.
 */
export function unscrambleModulus(scrambled: Uint8Array): Uint8Array {
  if (scrambled.length !== 128) throw new Error(`Expected 128-byte modulus, got ${scrambled.length}`);
  const k = new Uint8Array(scrambled);

  // step 4: xor bytes 0x00..0x03 with bytes 0x4d..0x50
  for (let i = 0; i < 4; i++) k[0x00 + i] ^= k[0x4d + i];
  // step 3: xor bytes 0x4d..0x50 with bytes 0x00..0x03
  for (let i = 0; i < 4; i++) k[0x4d + i] ^= k[0x00 + i];
  // step 2: swap bytes 0x00..0x03 with bytes 0x4d..0x50
  for (let i = 0; i < 4; i++) {
    const t = k[0x00 + i];
    k[0x00 + i] = k[0x4d + i];
    k[0x4d + i] = t;
  }
  // step 1: swap blocks 0x00..0x40 with 0x40..0x80
  for (let i = 0; i < 0x40; i++) {
    const t = k[0x00 + i];
    k[0x00 + i] = k[0x40 + i];
    k[0x40 + i] = t;
  }
  return k;
}

/** Encrypt a 128-byte plaintext block with RSA (e=65537) using the unscrambled modulus. */
export function rsaEncryptBlock(plaintext: Uint8Array, modulus: Uint8Array): Uint8Array {
  if (plaintext.length !== 128) throw new Error(`RSA plaintext must be 128 bytes, got ${plaintext.length}`);
  const n = bytesToBigInt(modulus);
  const m = bytesToBigInt(plaintext);
  const c = modPow(m, 65537n, n);
  return bigIntToBytes(c, 128);
}

/**
 * Pack username + password into the 128-byte block expected by RequestAuthLogin
 * (Classic / Live layout). Older chronicles (Interlude) put everything inside
 * a single 128-byte block at offset 0x5e; newer protocols split the credential
 * into two 128-byte blocks. We start with the single-block layout — most
 * common variant.
 */
export function packAuthLoginBlock(username: string, password: string): Uint8Array {
  const block = new Uint8Array(128);
  // Classic layout: account at 0x5e (14 bytes ASCII), password at 0x6c (16 bytes ASCII).
  // (Different scripts use 0x4e/0x5c; we expose both via packAuthLoginBlockNewer.)
  const u = new TextEncoder().encode(username.slice(0, 14));
  const p = new TextEncoder().encode(password.slice(0, 16));
  block.set(u, 0x5e);
  block.set(p, 0x6c);
  return block;
}

/** Two-block layout used by GoD+ protocols. Returns 256 bytes total. */
export function packAuthLoginBlocksNewer(username: string, password: string): Uint8Array {
  const out = new Uint8Array(256);
  const u = new TextEncoder().encode(username.slice(0, 50));
  const p = new TextEncoder().encode(password.slice(0, 16));
  // block 1: username at 0x4e
  out.set(u, 0x4e);
  // block 2: password at 0x80 + 0x5c
  out.set(p, 0x80 + 0x5c);
  return out;
}
