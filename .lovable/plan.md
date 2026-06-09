## Status του UTF-16 fix

Έγινε ήδη στο προηγούμενο loop — `src/lib/l2-package.ts` γρ. 198–215 χειρίζεται σωστά αρνητικό `rawLen` (UTF-16LE, `|len|` code units). Δεν χρειάζεται τίποτα άλλο εκεί. Άρα το μπλόκο για S3 έχει φύγει.

Τώρα τα δύο σημεία από το review:

## 1. `parseCharInfo` — διάβασε classId + paperdoll

Αρχείο: `src/lib/l2-protocol/game-client.ts` γρ. 671–687.

Τώρα σταματάει στο `female` και αγνοεί το υπόλοιπο, οπότε οι άλλοι παίχτες σπαουνάρουν «γυμνοί». Προέκταση μετά το `female`:

- `r.u32()` → **classId** (χρειάζεται για να διαλέξουμε σωστό model/animation set).
- Μερικά CharInfo builds έχουν `u32 unk` εδώ (Grand Crusade «class id 2 / level reveal»). Αν το running protocol είναι το 502 που ήδη υποστηρίζουμε, το pad είναι 1× u32. Διαβάζω + αγνοώ.
- **Paperdoll slot ids** (u32 each) με τη γνωστή σειρά L2 paperdoll: under, rear, lear, neck, rfinger, lfinger, head, **rhand**, lhand, **gloves**, **chest**, **legs**, **feet**, cloak, lrhand, hair, hair2, rbracelet, lbracelet, talisman×6, belt. Για το rendering μας αρκούν: `rhand, lhand, gloves, chest, legs, feet, head, cloak`. Τα κρατάω όλα στο entity ως `equip: { slot: itemId }` για να μπορούμε να ντύσουμε bracelet/cloak αργότερα χωρίς νέο reparse.
- Augment / enchant arrays που ακολουθούν → skip με ασφαλή `try/catch` (αν δεν είμαστε σίγουροι για μήκος, δεν πειράζουμε τίποτα μετά — το πακέτο είναι ήδη body-bounded).

Αλλαγή στο `WorldEntity` (γρ. 52–67): πρόσθεσε προαιρετικά:
```ts
classId?: number;
equip?: Partial<Record<
  "rhand"|"lhand"|"gloves"|"chest"|"legs"|"feet"|"head"|"cloak",
  number
>>;
```

Συμβατότητα: όλα προαιρετικά, οπότε δεν σπάει υπάρχοντες consumers (`WorldViewport`, `npc-spawn` handler).

Σημείωση τιμών: 0 = κενό slot — να μην το προσθέτω στο `equip`.

## 2. `sendAttack` — shift πρέπει να είναι `false`

Αρχείο ίδιο, γρ. 532–534.

```ts
sendAttack(objectId: number) {
  this.sendAction(objectId, false); // shift=1 = info window, όχι attack
}
```

Κρατάμε το `sendAction(id, true)` για ξεχωριστό `sendInspect(id)` helper, ώστε το UI να μπορεί να ζητάει info window χωρίς να μπερδεύεται με το attack path.

Πρόσθεσε:
```ts
sendInspect(objectId: number) { this.sendAction(objectId, true); }
```

Δεν αλλάζω τίποτα άλλο στο `sendAction` (το shift byte παραμένει ως 0/1).

## Έλεγχοι

- Build: η αλλαγή είναι type-safe (όλα τα νέα fields optional).
- Runtime smoke: μετά από EnterWorld, σε `npc-spawn` event με `isPlayer: true` πρέπει να έρχονται `classId` και `equip` με non-zero ids όταν ο άλλος παίχτης φοράει πραγματικά items.
- Attack: αριστερό κλικ σε monster → ο server πρέπει να αρχίσει να στέλνει `Attack (0x05)` packets αντί για HTML/info.

## Αρχεία προς αλλαγή

- `src/lib/l2-protocol/game-client.ts` — `WorldEntity` interface (+ classId/equip), `parseCharInfo` (επέκταση paperdoll read), `sendAttack` (shift=false), νέο `sendInspect`.

## Out of scope (εδώ)

- Map-loader συντεταγμένες/scale — το αφήνουμε για ξεχωριστό loop.
- Πραγματικό attachment των equipment ids σε mesh slots (αυτό είναι S7 με Armorgrp.dat). Εδώ απλά τα φέρνουμε στο entity για να είναι διαθέσιμα.
- Augment/enchant parsing — skip τώρα, όταν χρειαστεί enchant glow το ξαναπιάνουμε.
