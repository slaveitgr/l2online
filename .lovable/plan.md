## Πρόβλημα

Το login server flow τελειώνει σωστά και πέρνεις PlayOk. Μετά το client προσπαθεί να ανοίξει 2ο WebSocket στο `/api/l2-bridge?host=176.92.69.220&port=7777` για τον Game Server, αλλά το bridge απαντάει **HTTP 403 "Host not allowed"** γιατί το `ALLOWED_HOSTS` περιέχει μόνο `l2server.slave.gr`. Ο browser βλέπει αποτυχημένο WS upgrade και δεν εμφανίζει τίποτα άλλο στο log.

Το port (7777) είναι σωστό — προέρχεται από το ServerList packet (`61 1e 00 00` = 0x1e61 = 7777), όχι hardcoded.

## Λύση (1 αρχείο)

### `src/routes/api/l2-bridge.ts`

1. **Επέκταση `ALLOWED_HOSTS`** ώστε να δέχεται και IP literals των γνωστών game servers του slave.gr:
   - `l2server.slave.gr` (login)
   - `176.92.69.220` (GS που γύρισε το ServerList)
2. **Καλύτερο logging σφαλμάτων**: αν το `connect()` αποτύχει async (μετά το επιστρεφόμενο 101), στείλε `{type:"error", error:"..."}` πάνω στο WS πριν κλείσει, ώστε ο client να μπορεί να εμφανίσει συγκεκριμένη αιτία αντί για σιωπηλό κλείσιμο.
3. **Διεύρυνση `ALLOWED_PORTS`** να καλύπτει και 2000-2010 + 7000-7790 (κάποια chronicles τρέχουν GS σε άλλα ports), αλλά κρατάμε τη λίστα κλειστή.

### `src/routes/index.tsx` (μικρή προσθήκη — μόνο UI feedback)

- Όταν το `L2GameClient.start()` επιστρέψει `{type:"error"}`, εμφάνισε το exact error string στο protocol log (ήδη γίνεται μέσω `onEvent`), αλλά πρόσθεσε και ένα toast/inline μήνυμα στο κουμπί "ENTER WORLD" ώστε ο χρήστης να βλέπει "GS connect failed: …" αντί για κενό spinner.

## Out of scope

- Δεν αλλάζουμε το game-server parsing (`game-client.ts`, `game-crypt.ts`). Αυτό θα το δοκιμάσουμε μόλις φτάσει πραγματικό KeyPacket — αν χρειαστούν διορθώσεις, νέα iteration με βάση τα bytes που θα logάρει.
- Δεν ανοίγουμε το bridge σε αυθαίρετα hosts (security).

## Επόμενο βήμα μετά το fix

Θα ξανατρέξεις το login και θα μου στείλεις το log από `[GS] connecting bridge…` και μετά. Αναμενόμενα events:
1. `[GS] WebSocket open`
2. `[GS] TCP connected 176.92.69.220:7777`
3. `[GS] ← key …` (πρώτο plaintext KeyPacket)
