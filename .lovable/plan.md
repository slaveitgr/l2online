# Fix: Init packet decrypts to garbage

## Root cause

After decrypting the 192-byte Init packet with the static Blowfish key and reversing `encXORPass`, the first byte should be the Init opcode `0x00`. Instead the bridge log shows `64 37 0f 19 …` — pure noise. This means the Blowfish step is producing the wrong plaintext.

Comparing the server source the user uploaded (`L2J_Mobius_12.3_Superion_Source`) to our TypeScript implementation:

- Server `BlowfishEngine.bytesTo32bits` reads each 8-byte block as **little-endian** (`byte[0] | byte[1]<<8 | byte[2]<<16 | byte[3]<<24`), and `bits32ToBytes` writes back the same way.
- Our `src/lib/l2-protocol/blowfish.ts` reads/writes the block with `getUint32(..., false)` / `setUint32(..., false)` — **big-endian**, which is the textbook Blowfish convention but NOT what this fork of Mobius (the Async-mmocore variant used by Superion) uses.

The key schedule itself is unchanged on both sides (standard BE cyclic XOR of key bytes into `P[]`), so only the per-block byte packing in `encrypt`/`decrypt` is wrong. Everything else (`encXORPass` inverse, static key constant, RSA scramble, opcode map, framing) is already aligned with the server source.

## Change

**File:** `src/lib/l2-protocol/blowfish.ts`

In both `encrypt(data)` and `decrypt(data)`, switch the 8-byte block I/O to little-endian:

```ts
const l = view.getUint32(i, true);      // was: false
const r = view.getUint32(i + 4, true);  // was: false
// ...
view.setUint32(i, el, true);            // was: false
view.setUint32(i + 4, er, true);        // was: false
```

(Apply the same little-endian flag to the matching reads/writes in `encrypt`. Leave the key-schedule loop in the constructor untouched.)

No other files need changes for this fix. The existing static-key, `decXORPass`, RSA unscramble, and opcode handling in `login-client.ts` will now see real plaintext: the next log line should report `revision=<server protocol>`, a sane 32-bit session id, and progress to `AuthGameGuard → GGAuth → RequestAuthLogin`.

## Verification

After the change, reconnect from the SIGN IN form. Expected protocol log:

```
← init enc 192B …
← init dec 192B 00 <sessionId×4> <revision×4> …
Init OK. revision=… session=0x…
Sending AuthGameGuard
← opcode 0x0b (…) → gg-ok
Sending RequestAuthLogin
← opcode 0x03 (LoginOk) or 0x01 (LoginFail)
```

If Init still does not start with `0x00`, the static key on this specific server build differs and we will need to capture the wire bytes for further inspection — but the source confirms the standard Mobius key, so LE block I/O is the expected fix.
