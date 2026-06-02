## Διάγνωση

Ο GS handshake φτάνει μέχρι το KeyPacket, αλλά μετά το `AuthLogin` ο server κάνει immediate close. Αυτό σημαίνει ότι το encrypted AuthLogin που στείλαμε ήταν garbage — δηλαδή **λάθος cipher seed**.

Mobius KeyPacket layout (το πιο πιθανό για slave.gr):
```
u8  opcode = 0x2E
u8  ok     = 0x00 (status byte — εδώ ήταν 0x00 αλλά συνέχισε να στέλνει key)
u8[8] cipherKey
u32 ...  // flags (sessionId, gg, etc.)
```

Το ταίριασμα των επόμενων bytes επιβεβαιώνει: `00 00 00 00 01 00 00 00 01 00 00 00 ...` = `writeD(0)+writeD(1)+writeD(1)+…`, καθαρά Mobius.

## Αλλαγή (1 αρχείο)

### `src/lib/l2-protocol/game-client.ts` — `handlePacket` (KeyPacket branch)

Παράλειψη του status byte πριν διαβάσουμε το 8-byte cipher seed:

```ts
const op = r.u8();          // 0x2E
const ok = r.u8();          // status (0x00 ή 0x01 ανάλογα chronicle)
const seed = r.bytes(8);    // ← τώρα διαβάζει 51 7d 35 d8 bc e4 d1 69
```

Επίσης:
- Αν `ok !== 0 && ok !== 1`, treat as parse failure με σαφές μήνυμα.
- Log και του `ok` byte ώστε αν ξανασπάσει να βλέπουμε.

## Εφεδρικά (αν συνεχίσει να κλείνει μετά το fix)

Δεν τα κάνουμε τώρα — μόνο αν το παραπάνω δεν λύσει το πρόβλημα:
1. Δοκιμή protocol revision Mobius-specific (π.χ. 152 / 419 / 110) αντί του login `0xc621`.
2. Δοκιμή AuthLogin opcode 0x08 ή 0x0B αντί 0x2B.
3. Έλεγχος σειράς session keys (`playKey1/playKey2` vs `loginKey1/loginKey2`).

Για όλα αυτά θα χρειαστεί το log μετά το fix για να αποφασίσουμε σωστά.

## Out of scope

- `CharSelectionInfo` parsing — θα το δούμε μόλις φτάσει το πρώτο πραγματικό packet.
- Καμία αλλαγή σε bridge / login client / UI.

## Επόμενο βήμα

Ξανατρέξε ENTER WORLD και στείλε το log από `[GS] cipher seed=…` και μετά.
