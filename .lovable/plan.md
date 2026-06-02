## Διάγνωση #2

Cipher seed επιβεβαιωμένα σωστό (`23 f6 da 19 d1 f0 a4 d5` με τα flag bytes να ταιριάζουν Mobius pattern), αλλά ο server κλείνει αμέσως μετά το AuthLogin.

Στο `game-client.ts → sendFrame(body, true)` περνάμε το body από `appendChecksumAndPad()` πριν το encrypt. Αυτό ήταν αντιγραφή από το **login client** όπου Blowfish απαιτεί 8-byte block alignment + checksum. Όμως ο Mobius **GameServer δεν χρησιμοποιεί ούτε checksum ούτε padding** — μόνο straight XOR stream cipher στο raw body. Άρα ο GS διαβάζει το AuthLogin με 4 extra bytes (checksum) + padding, βρίσκει garbage keys / size mismatch και κλείνει.

## Αλλαγή (1 αρχείο, 1 γραμμή)

### `src/lib/l2-protocol/game-client.ts` — `sendFrame`

```ts
private sendFrame(plainBody: Uint8Array, encrypted: boolean) {
  if (!this.ws) return;
  const payload = encrypted
    ? this.crypt!.encrypt(plainBody)           // ← χωρίς checksum/padding
    : plainBody;
  ...
}
```

Επίσης κρατάμε ως comment: «GS Mobius: raw XOR, no checksum, no padding». Αν αργότερα δοκιμάσουμε classic L2J fork που θέλει checksum, θα το γυρίσουμε πίσω με flag.

## Επιπλέον log

Πριν στείλουμε το AuthLogin να εκτυπώνουμε και τα πρώτα bytes του ENCRYPTED payload (πρώτα 16 bytes hex). Αν ξανακλείσει, θα δούμε αν το cipher είναι αλφαβητικά σωστό (το πρώτο byte μετά XOR πρέπει να = `0x2B ^ key[0] ^ 0` = `0x2B ^ 0x23` = `0x08`).

## Out of scope

- Τίποτα άλλο.

## Επόμενο βήμα

Στείλε το log από `[GS] → AuthLogin` και κάτω.
