## Πρόβλημα

Από το log:
```
[GS] ← key 26B 2e 00 4c 03 ed 93 60 81 92 5a 00 00 00 00 01 ...
[GS] cipher seed=4c 03 ed 93 60 81 92 5a  ← λάθος, off-by-one
```

Ο Mobius/L2J GameServer στέλνει KeyPacket ως:
- C  opcode `0x2E`
- C  flag byte (`0x00` ή `0x01`)
- B  **8-byte seed** (το πραγματικό GameCrypt seed)
- ... status flags

Το σωστό seed στο παράδειγμα είναι `4c 03 ed 93 60 81 92 5a` — όχι αυτό που παίρνουμε τώρα μετατοπισμένο κατά 1 byte. Με λάθος seed, το AuthLogin κρυπτογραφείται με γκάρμπατζ key και ο server κλείνει αμέσως (`tcp-eof`).

## Αλλαγή (1 αρχείο)

### `src/lib/l2-protocol/game-client.ts` — KeyPacket parsing branch (≈ γραμμές 156-178)

Αντικατάσταση:
```ts
const r = new PacketReader(body);
const op = r.u8();
if (op !== 0x2e && op !== 0x00) {
  throw new Error(`expected KeyPacket opcode 0x2E or 0x00, got 0x${op.toString(16)}`);
}
const seed = r.bytes(8);
```

Με:
```ts
const op = body[0];
if (op !== 0x2e && op !== 0x00) {
  throw new Error(`expected KeyPacket opcode 0x2E or 0x00, got 0x${op.toString(16)}`);
}
// Mobius/L2J KeyPacket: after opcode 0x2E υπάρχει ένα flag byte (0x00/0x01),
// ΜΕΤΑ το 8-byte seed. Classic opcode 0x00 βάζει το seed αμέσως μετά.
let seedOffset = 1;
if (op === 0x2e && body.length >= 10 && (body[1] === 0x00 || body[1] === 0x01)) {
  seedOffset = 2;
}
if (body.length < seedOffset + 8) {
  throw new Error(`KeyPacket too short: ${body.length}B`);
}
const seed = body.slice(seedOffset, seedOffset + 8);
```

Το υπόλοιπο (`new GameCrypt(seed)`, `gotKey = true`, `key-ok`, log, `sendAuthLogin()`) μένει ως έχει.

## Verification

Μετά το fix το log πρέπει να γίνει:
```
[GS] cipher seed=4c 03 ed 93 60 81 92 5a   (ή ό,τι αντίστοιχο για το νέο session)
[GS] → AuthLogin user="mslave"
[GS] → enc 35B ...
[GS] ← op 0x09|0x13|0x67 ...   ← CharSelectionInfo, αντί για tcp-eof
```

Αν παρά το σωστό seed ο server συνεχίσει να κλείνει, το επόμενο ύποπτο είναι το layout του AuthLogin (σειρά `playKey/loginKey`, extra trailing bytes) — out of scope για αυτό το βήμα.

## Out of scope

- Server #2 (`127.0.0.1:0`) — dummy entry, αγνοείται.
- Πειραγμα στο AuthLogin payload — μόνο αν δεν φτιάξει με το seed fix.
