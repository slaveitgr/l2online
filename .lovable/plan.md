## Goal
Part B από το spec: σύνδεση του enter-world handshake στο UI. Ο `L2GameClient` υποστηρίζει ήδη `keepAlive`, `selectCharacter`, `setEventHandler`, `disconnect` και τα `getGameConnection/setGameConnection` singletons — απομένει να τα κουμπώσουμε στα 3 routes.

Part C (rendering pipeline από Lineage2JS) είναι μακροπρόθεσμος οδικός χάρτης — δεν το αγγίζουμε σε αυτό το loop.

## Changes

### 1) `src/routes/index.tsx` — κράτα ζωντανή τη GS μετά το roster
- Import `setGameConnection` από `@/lib/l2-protocol/game-client`.
- Στο `onEnterWorld`, στο `new L2GameClient({...})` πρόσθεσε `keepAlive: true`.
- Όταν `gr.type === "characters"`: κάλεσε `setGameConnection(gs)` **πριν** το `navigate({ to: "/characters" })`.
- Σε `gr.type === "error" | "closed"` paths: μην κρατάς stale singleton — κάλεσε `setGameConnection(null)`.
- `login.close()` παραμένει όπως είναι (κλείνουμε μόνο τον LS).

### 2) `src/routes/characters.tsx` — ENTER WORLD μέσω της ζωντανής GS
- Import `getGameConnection`, `setGameConnection` και `type GameEvent`.
- State: `entering: boolean`, `enterError: string | null`, `enterLog: string[]` (live append).
- Νέα `enterWorld()` (αντικαθιστά το `navigate({ to: "/world" })` του κουμπιού):
  - `const conn = getGameConnection()`. Αν `!conn || !conn.connected` → καθάρισε `sessionStorage` σχετικά και `navigate({ to: "/" })` με μήνυμα «session lost».
  - `const slot = Math.max(0, chars.findIndex(c => c.id === selected))`.
  - `conn.setEventHandler(ev => { ... })`:
    - `status` → push σε `enterLog` + persist στο `sessionStorage` `l2_gslog`.
    - `char-selected` → απλώς log.
    - `in-world` → `navigate({ to: "/world" })` (το singleton μένει· ο `/world` το αναλαμβάνει).
    - `error` → `setEnterError(ev.error)`, `setEntering(false)`.
    - `closed` → αν δεν έχουμε ήδη φτάσει σε in-world, treat ως error.
  - `setEntering(true); conn.selectCharacter(slot);`
- Κουμπί ENTER WORLD: `disabled={entering}`, label «ENTERING…» όταν `entering`.
- Render `enterError` κάτω από το κουμπί (ίδιο styling με τα υπόλοιπα error blocks του project).
- Το υπάρχον `logPanel` (από `sessionStorage`) μένει· επιπλέον δείξε τα live `enterLog` lines στο ίδιο panel ώστε να φαίνεται η ροή `CharacterSelect → CharSelected → EnterWorld → world packets`.

### 3) `src/routes/world.tsx` — προσδέσου στη ζωντανή σύνδεση
- Import `getGameConnection` και `type GameEvent`.
- `useEffect` mount:
  - `const conn = getGameConnection();`
  - Αν `!conn || !conn.connected` → `navigate({ to: "/" })` (no live world, return to launcher).
  - Διαφορετικά `conn.setEventHandler(ev => { ... })` — για τώρα απλό logging των `world-packet` σε ένα μικρό overlay (συν δικό μας `console.log("[GS world]", ev)`). World-state parsing είναι σκόπιμα out-of-scope.
- Cleanup: το «Exit» link (header) πρέπει να καλεί `conn.disconnect()` + `setGameConnection(null)` πριν το navigation στο `/characters`. Το αλλάζουμε από `<Link>` σε `<button onClick={...}>` με ίδιο styling.
- Το unmount cleanup του `useEffect` ΔΕΝ καλεί `disconnect()` — αυτό θα έκλεινε τη σύνδεση σε κάθε hot-reload / route change. Disconnect μόνο μέσω του Exit κουμπιού.

## Out of scope
- Part C (Lineage2JS rendering pipeline) — ξεχωριστό roadmap, πολλές φάσεις.
- World-state parsing (UserInfo/NpcInfo). Για τώρα μόνο logging των world packets.
- Keep-alive responses (RequestManorList, validatePosition, pings) — αρκούν για το πρώτο spawn handshake όπως λέει το spec.

## Verification
1. Login → επιλογή server → ENTER WORLD στο launcher → roster φορτώνει, μεταβαίνει σε `/characters`. Το GS socket παραμένει ανοιχτό (DevTools → Network → WS → l2-bridge: open).
2. Στο `/characters`, ENTER WORLD πάνω σε χαρακτήρα → στο Protocol log φαίνεται:
   - `[GS] → CharacterSelect slot=N`
   - `[GS] CharSelected "<name>" @ x,y,z`
   - `[GS] → EnterWorld`
   - `[GS] EnterWorld accepted — receiving world state`
   - `[GS] (world) ← op 0x..` (UserInfo κ.λπ.)
3. Auto-redirect σε `/world`. Το world packet log συνεχίζει να γεμίζει στο overlay.
4. Click «Exit» → socket κλείνει (`[GS] socket closed`), redirect στο `/characters`.
5. Hard refresh στο `/characters` ή `/world` → singleton χάθηκε → redirect στο `/` με κατάλληλο μήνυμα (όχι crash).
