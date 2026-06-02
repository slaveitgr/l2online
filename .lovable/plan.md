## Στόχος

Να φτάσουμε από σωστό AuthLogin → σωστή λίστα χαρακτήρων → enter world, με βάση τον Mobius 12.3 Superion source (protocol 502). Login server, KeyPacket, GameCrypt, AuthLogin μένουν ως έχουν.

## Αλλαγές

### 1) `src/lib/l2-protocol/packets.ts` — helpers

Πρόσθεσε στον `PacketReader`:
- `u64(): bigint` — 8-byte LE read (advance 8)
- `f64(): number` — `DataView.getFloat64(off, true)` (advance 8)

Δεν αλλάζει τίποτα υπάρχον.

### 2) `src/lib/l2-protocol/game-client.ts` — CharSelectionInfo opcode set

Στο switch κράτα μόνο `case 0x09:` για το CharSelectionInfo. Βγάλε τα `0x13` και `0x67` (δεν ισχύουν για 502).

### 3) `src/lib/l2-protocol/game-client.ts` — `parseCharSelectionInfo`

Αντικατάσταση της συνάρτησης ώστε να ακολουθεί ακριβώς το layout του Mobius 502:

```ts
private parseCharSelectionInfo(body: Uint8Array) {
  try {
    const r = new PacketReader(body);
    r.u8();                 // opcode 0x09
    const count = r.u32();  // FIX: count is int, not byte
    if (count > 32) {
      this.settle({ type: "error", error: `[GS] implausible char count: ${count}` });
      return;
    }
    // Header before per-char array:
    // int MAX_CHARACTERS, byte isMax, byte canPlay, int 2 (KR flag), byte 0, byte 0
    r.skip(12);

    const chars: GameCharacter[] = [];
    for (let i = 0; i < count; i++) {
      const name      = r.str();
      const objectId  = r.u32();
      r.str();              // accountName
      r.u32();              // sessionId
      r.u32();              // clanId
      r.u32();              // builderLevel
      r.u32();              // sex
      const race      = r.u32();
      const baseClass = r.u32();
      r.u32();              // serverId
      r.skip(12);           // x, y, z (3× int)
      r.skip(8);            // currentHp (double)
      r.skip(8);            // currentMp (double)
      r.skip(8);            // sp  (LONG, not int)
      r.skip(8);            // exp (long)
      r.skip(8);            // expPercent (double) — was missing
      const level     = r.u32();

      // Consume the rest of the per-char block so the next char aligns.
      r.u32();              // reputation
      r.u32();              // pkKills
      r.u32();              // pvpKills
      r.skip(9 * 4);        // 9× int zeros (incl. 2 Ertheia)
      r.skip(60 * 4);       // paperdoll item ids (60 slots)
      r.skip(9 * 4);        // paperdoll visual ids (9 slots)
      r.skip(5 * 2);        // 5× short enchant
      r.u32();              // hairStyle
      r.u32();              // hairColor
      r.u32();              // face
      r.skip(8);            // maxHp (double)
      r.skip(8);            // maxMp (double)
      r.u32();              // deleteTimer
      r.u32();              // 0
      r.u32();              // -1
      r.u32();              // classId
      r.u32();              // active flag
      r.u8();               // rhand enchant
      r.skip(3 * 4);        // 3× augment option
      r.skip(4 * 4);        // 4× int zeros (incl. transformation)
      r.skip(4 * 4);        // petNpcId, petLevel, petFood, petFoodLevel
      r.skip(8);            // petHp (double)
      r.skip(8);            // petMp (double)
      r.u32();              // vitalityPoints
      r.u32();              // vitalityPercent
      r.u32();              // vitalityItemsUsed
      r.u32();              // active2
      r.u8();               // noble
      r.u8();               // heroGlow
      r.u8();               // hairAccessory
      r.u32();              // banTimeLeft
      r.u32();              // lastPlayTime
      r.u8();               // 0
      r.u32();              // dkColor
      r.u32();              // 0
      r.u8();               // vanguard mount
      r.skip(3);            // 3× byte 0
      r.skip(4 * 8);        // 4× long 0
      r.u32();              // 0

      chars.push({
        id: objectId.toString(16),
        name,
        klass: classNameOf(baseClass),
        race: raceNameOf(race),
        level,
        color: colorFromName(name),
      });
    }
    this.emit({ type: "status", message: `[GS] parsed ${chars.length} character(s)` });
    this.settle({ type: "characters", chars });
  } catch (err) {
    this.settle({ type: "error", error: `[GS] CharSelectionInfo parse failed: ${(err as Error).message}` });
  }
}
```

Σημείωση: τα `PAPERDOLL_ORDER` (60) και `PAPERDOLL_ORDER_VISUAL_ID` (9) είναι chronicle-specific αλλά ισχύουν για το 12.3 Superion build που τρέχουμε.

### 4) Out of scope για αυτό το βήμα

`CharacterSelect (0x12)` και `EnterWorld (0x11)` δεν υλοποιούνται τώρα — θα γίνουν αφού επιβεβαιωθεί ότι η λίστα χαρακτήρων διαβάζεται σωστά. Ο τωρινός flow τερματίζει με `settle({ type: "characters" })` και αυτό αρκεί για να δούμε το roster στο UI.

## Verification

Μετά το ENTER WORLD το log πρέπει να δείξει:
```
[GS] cipher seed=...
[GS] → AuthLogin user="mslave"
[GS] → enc 35B ...
[GS] ← op 0x09 (...B) ...
[GS] parsed N character(s)
```
και το UI να εμφανίζει ονόματα/class/race/level χωρίς garbage. Αν το count > 1 και ο 2ος char δείχνει σκουπίδια → το per-char block του §6 δεν καταναλώθηκε σωστά (παλαιότερο/νεότερο paperdoll layout).
