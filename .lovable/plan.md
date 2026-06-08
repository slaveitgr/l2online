# Plan: Fix name-table UTF-16 bug στον package parser

Ο Claude έχει 100% δίκιο. Στο `src/lib/l2-package.ts`, το loop ονομάτων (γρ. 198–209) ελέγχει μόνο `len > 0`, οπότε για ver133/lic40 `.ukx` (όπου τα ονόματα είναι UTF-16 με αρνητικό compact length) η συμβολοσειρά αγνοείται **ΚΑΙ** το cursor δεν προχωράει — όλο το name table ξεσυγχρονίζεται από το πρώτο UTF-16 entry και μετά.

Επιπτώσεις: σπάει χαρακτήρες, armor, NPC, animations (S3/S6/S7/S15/S16). Δεν φάνηκε ως τώρα γιατί τα maps (`.unr`/`.usx`) είναι ASCII και δουλεύουν.

## Fix

Ένα file, ένα loop. `src/lib/l2-package.ts` γρ. 198–209:

```ts
for (let i = 0; i < nameCount; i++) {
  const [rawLen, s] = readCompat32(b, o);
  o += s;
  let nm = "";
  if (rawLen < 0) {
    // ver133/lic40 .ukx: UTF-16LE, |rawLen| code units (NUL included)
    const len = -rawLen;
    for (let c = 0; c < len - 1; c++) {
      nm += String.fromCharCode(b[o + c * 2] | (b[o + c * 2 + 1] << 8));
    }
    o += len * 2;
  } else if (rawLen > 0) {
    for (let c = 0; c < rawLen - 1; c++) nm += String.fromCharCode(b[o + c]);
    o += rawLen;
  }
  const flags = dv.getUint32(o, true);
  o += 4;
  this.names.push({ name: nm, flags });
}
```

## Επαλήθευση

- Γρήγορο sanity: το `l2-unreal-object-index.ts` `readCompactString` ήδη το κάνει σωστά (γρ. 474–488) — άρα η συμπεριφορά είναι ήδη επιβεβαιωμένη αλλού στο codebase, απλά λείπει από τον main parser.
- Maps (.unr/.usx) θα συνεχίσουν να δουλεύουν (ASCII branch αμετάβλητος).
- Μόλις φτάσει fixture object name από `.ukx` (π.χ. `Fmagic_m031_u`), το `L2Package.from()` πρέπει να επιστρέφει σωστά `names[]` χωρίς garbage/empty strings στις θέσεις των UTF-16 entries.

## Out of scope

- Το `ukx/name-table.ts` που γράψαμε στο προηγούμενο step είναι ήδη σωστό (sign-bit branch). Δεν αλλάζει.
- Καμία άλλη αλλαγή σε imports/exports tables — τα `readCompat32` calls εκεί δεν διαβάζουν strings.

## Files
- Edited: `src/lib/l2-package.ts` (μόνο το name-table loop, ~12 lines).

Μόλις εγκρίνεις, το πατάω.
