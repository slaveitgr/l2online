## Goal
Το Protocol log χάνεται όταν το `onEnterWorld` κάνει `navigate({ to: "/characters" })`. Θέλουμε να το κρατάμε ώστε να μπορεί ο χρήστης να το δει/κάνει copy μετά το redirect.

## Changes

### 1) `src/routes/index.tsx`
- Στους `onEvent` handlers του login και του game client πρόσθεσε `console.log("[LS]", ev)` / `console.log("[GS]", ev)` ώστε το log να επιβιώνει στο DevTools Console (το SPA navigate δεν κάνει reload).
- Κράτα ένα τοπικό `logBuf: string[]` που γεμίζει σε κάθε `pushStatus` (ή στους handlers απευθείας). Πριν το `navigate({ to: "/characters" })` στο `onEnterWorld`:
  ```ts
  sessionStorage.setItem("l2_gslog", JSON.stringify(statusLog));
  ```
  Επίσης σε error path (όταν `gr.type === "error"` ή `"closed"`) — να σώζεται κι εκεί για debugging.

### 2) `src/routes/characters.tsx`
- Πρόσθεσε ένα collapsible `<details>` panel «Protocol log» στο τέλος της σελίδας που διαβάζει `sessionStorage.getItem("l2_gslog")` και το εμφανίζει σε `<pre>` (ίδιο styling με το launcher panel).
- Έτσι ο χρήστης βλέπει τα `[GS] ← op 0x09 ...`, `[GS] parsed N character(s)` κ.λπ. ακόμα και μετά το redirect, και μπορεί να τα κάνει copy.

## Out of scope
Καμία αλλαγή σε protocol/parser logic. Καθαρά παρουσίαση/persistence του log.

## Verification
1. Login → ENTER WORLD.
2. Στο `/characters`, άνοιγμα του «Protocol log» panel → φαίνεται όλη η ροή από `[GS] encryption=OFF seed=...` έως `[GS] parsed N character(s)`.
3. Εναλλακτικά, DevTools Console με «Preserve log» δείχνει τα ίδια events.
