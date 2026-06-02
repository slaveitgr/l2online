# Lineage 2 Browser Client — Φάση 1

Χτίζουμε ένα web-based L2 client shell στο Lovable με βάση τα `Lineage2JS` (three.js renderer για L2 Unreal assets) και `l2js-client` (TS port του πρωτοκόλλου). Σε αυτή τη φάση: **UI shell + asset loader + 3D viewport**. Χωρίς πραγματικό networking (mock login).

## Τι περιλαμβάνει

**1. Launcher / Login screen** (`/`)
- L2-style dark UI: brand header, background art, version label
- Server list dropdown (mock δεδομένα: Bartz, Sieghardt, κλπ)
- Username/password form (stub — δεν στέλνει πουθενά, κάνει redirect στο `/select-files`)
- "Settings" κουμπί → audio/graphics presets (αποθήκευση σε localStorage)

**2. Asset selection** (`/select-files`)
- File picker (`webkitdirectory`) για τον φάκελο του L2 Interlude client
- Validation: εντοπισμός κρίσιμων φακέλων (`system/`, `maps/`, `textures/`, `staticmeshes/`, `animations/`)
- Progress UI κατά το indexing
- Cache σε **IndexedDB** (μέσω `idb` library) ώστε να μην ξαναζητάει τα αρχεία σε επόμενα sessions
- "Forget cached client" κουμπί

**3. Character select (stub)** (`/characters`)
- Mock 3 χαρακτήρες (πορτρέτο, name, class, level) σε hardcoded data
- "Enter World" → πάει στο `/world`

**4. World viewport** (`/world`)
- Full-screen `<canvas>` με three.js
- Ενσωμάτωση `Lineage2JS` (ή port των loaders του για `.unr/.utx/.usx`)
- Φόρτωμα ενός default map (π.χ. Talking Island village) από το cached client
- Orbit camera controls, basic HUD (FPS counter, position)
- Loading screen με progress bar καθώς διαβάζονται τα assets

**5. Shared layout**
- Dark L2 aesthetic: βαθύ μαύρο/μπορντό background, gold/amber accents, serif display font για τίτλους, monospace για debug HUD
- Design tokens στο `src/styles.css` (oklch)

## Routes

```text
src/routes/
  __root.tsx          shell + providers
  index.tsx           launcher / login (stub)
  select-files.tsx    asset folder picker + IndexedDB cache
  characters.tsx      stub character select
  world.tsx           three.js + Lineage2JS viewport
```

## Τεχνικές σημειώσεις

- **Dependencies**: `three`, `@types/three`, `idb`, και προσπάθεια εγκατάστασης `lineage2js` αν υπάρχει ως npm package. Αν όχι, vendor-άρουμε τα απαραίτητα loader αρχεία τοπικά (αναφερόμενοι στο repo `realratchet/Lineage2JS`).
- **`l2js-client`**: ΔΕΝ το εγκαθιστούμε σε αυτή τη φάση (δεν έχουμε networking). Αναφέρεται στον σχεδιασμό για Φάση 2.
- **Cloudflare Worker backend**: μένει αδρανές — όλη η λογική είναι client-side. Το server δεν αγγίζει L2 πρωτόκολλο.
- **IndexedDB**: αποθήκευση raw bytes των `.unr/.utx/.usx` keyed by relative path. Lazy loading (φόρτωμα ανά map).
- **Worker thread** για το parsing των Unreal packages ώστε να μην παγώνει το main thread (αν δείξει αναγκαίο).
- **Browser compatibility**: `showDirectoryPicker` (File System Access API) όπου υπάρχει, fallback σε `<input type="file" webkitdirectory>`.

## Νομικά / ξεκάθαρα στον χρήστη

- Πουθενά δεν διανέμουμε L2 client assets. Ο χρήστης ανεβάζει δικά του local αρχεία.
- Στο UI θα υπάρχει σαφές disclaimer.

## Εκτός σκοπού (για επόμενες φάσεις)

- Πραγματικό login/auth flow με L2 server
- WebSocket proxy (TCP → WS) — απαιτεί external host
- Movement / chat / combat / packets
- Multi-map streaming, character animations beyond default pose
- UI inventory / skills / party windows

## Παραδοτέο Φάσης 1

Ένα browser app όπου: ανοίγεις → βλέπεις L2 launcher → "login" → διαλέγεις τον φάκελο του Interlude client → φορτώνει assets → βλέπεις ένα 3D map να γίνεται render σε real-time με orbit camera. Όλα τα screens συνδεδεμένα, σταθερά, με dark L2 aesthetic.
