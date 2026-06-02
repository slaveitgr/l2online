# L2 Online

**L2 Online** είναι ένα πειραματικό browser-based Lineage II web client / launcher, φτιαγμένο με **TanStack Start**, **React**, **TypeScript**, **Three.js** και WebSocket-to-TCP bridge για επικοινωνία με Lineage II login/game server.

Το project έχει στόχο να δοκιμάσει κατά πόσο μπορεί ένα Lineage II client flow να τρέξει μέσα από browser: από login, server list και character selection, μέχρι μελλοντικό WebGL rendering πραγματικών assets του client.

> Κατάσταση project: **Alpha / Research Prototype**
>
> Το project δεν είναι ακόμα πλήρως playable client. Αυτή τη στιγμή λειτουργεί ως τεχνικό prototype για protocol login, asset streaming/cache και αρχικό WebGL viewport.

---

## Τι κάνει μέχρι τώρα

Το project περιλαμβάνει ήδη αρκετά βασικά κομμάτια ενός browser L2 client:

- Launcher σε browser
- Σύνδεση προς Lineage II login server
- WebSocket → TCP bridge
- Blowfish / RSA login protocol flow
- GameGuard authentication request
- LoginOk / LoginFail handling
- Server list parsing
- Επιλογή game server
- PlayOk request
- Σύνδεση προς game server
- Game server handshake
- Character list parsing
- Character selection screen
- IndexedDB asset cache
- CDN asset manifest
- Local Lineage II folder mount μέσω browser
- Three.js Phase 1 world viewport

---

## Τεχνολογίες

Το project είναι βασισμένο σε μοντέρνο frontend/server runtime stack:

- **TanStack Start**
- **React 19**
- **TypeScript**
- **Vite**
- **TailwindCSS 4**
- **Three.js**
- **IndexedDB**
- **Cloudflare Workers sockets**
- **WebSocket bridge**

---

## Βασική αρχιτεκτονική

Ο browser δεν μπορεί να ανοίξει απευθείας raw TCP σύνδεση προς Lineage II server.

Για αυτό το project χρησιμοποιεί bridge:

```text
Browser
  │
  │ WebSocket
  ▼
/api/l2-bridge
  │
  │ raw TCP
  ▼
Lineage II Login Server / Game Server
```

Το bridge επιτρέπει στο frontend να μιλήσει με τον L2 login/game server χωρίς native client.

---

## Login flow

Το login flow που υλοποιείται είναι:

```text
1. Browser ανοίγει WebSocket προς /api/l2-bridge
2. Το bridge ανοίγει TCP σύνδεση προς login server
3. Ο client λαμβάνει Init packet
4. Γίνεται static Blowfish decrypt
5. Διαβάζεται RSA modulus και Blowfish session key
6. Στέλνεται AuthGameGuard
7. Στέλνεται RequestAuthLogin
8. Λαμβάνεται LoginOk ή LoginFail
9. Ζητείται ServerList
10. Ο χρήστης επιλέγει game server
11. Στέλνεται RequestServerLogin
12. Λαμβάνεται PlayOk
13. Ξεκινά σύνδεση προς game server
```

---

## Game server flow

Μετά την επιλογή server:

```text
1. Σύνδεση προς game server μέσω bridge
2. Αποστολή ProtocolVersion
3. Λήψη KeyPacket
4. Ενεργοποίηση GameCrypt
5. Αποστολή AuthLogin
6. Ανάγνωση CharSelectionInfo
7. Εμφάνιση χαρακτήρων στο /characters
```

Αυτή τη στιγμή το game server κομμάτι στοχεύει κυρίως στο να εμφανίσει σωστά τους χαρακτήρες του account.

---

## Asset system

Το project υποστηρίζει δύο τρόπους πρόσβασης σε Lineage II client assets.

### 1. CDN streaming

Τα assets μπορούν να έρθουν από CDN μέσω manifest:

```text
/cdn-manifest.json
```

Το manifest περιέχει:

- path αρχείου
- μέγεθος
- sha256 hash
- συνολικό μέγεθος client
- base CDN URL

Τα αρχεία μπορούν να αποθηκευτούν σε IndexedDB cache, ώστε να μην κατεβαίνουν ξανά συνέχεια.

### 2. Local folder mount

Σε Chrome / Edge μπορεί να γίνει mount τοπικός φάκελος Lineage II client μέσω File System Access API.

Αυτό επιτρέπει στο project να διαβάζει assets κατευθείαν από τον τοπικό δίσκο, χωρίς να τα ανεβάζει και χωρίς να τα αντιγράφει όλα στην IndexedDB.

---

## Routes

Βασικά routes του project:

```text
/              Launcher / login screen
/characters    Character selection
/world         Phase 1 WebGL world viewport
/cdn-cache     CDN cache / asset management
/api/l2-bridge WebSocket-to-TCP bridge
```

---

## World viewport

Το `/world` route χρησιμοποιεί Three.js και εμφανίζει ένα αρχικό placeholder περιβάλλον:

- Terrain
- Fog
- Dynamic lighting
- Orbit camera
- FPS HUD
- Asset loader status

Το πραγματικό parsing και rendering των Lineage II Unreal assets (`.unr`, `.utx`, `.usx`, `.ukx`) είναι επόμενο στάδιο.

---

## Τρέχουσα κατάσταση

Το project βρίσκεται σε alpha φάση.

### Υπάρχει ήδη

- Browser launcher
- L2 login protocol client
- L2 game protocol αρχικό client
- Character selection
- Asset cache
- Local folder mount
- CDN manifest loader
- WebGL placeholder world

### Δεν υπάρχει ακόμα πλήρως

- Πραγματικό rendering Lineage II maps
- Πλήρης Unreal package parser
- Character model rendering
- Movement packets
- Full playable world
- Inventory / skills / NPC / combat
- Production-ready account management

---

## Roadmap

### Phase 1 — Protocol & Launcher

- [x] Browser launcher
- [x] Login server bridge
- [x] Login protocol handshake
- [x] Server list
- [x] PlayOk
- [x] Game server initial handshake
- [x] Character list
- [x] Character select screen

### Phase 2 — Assets

- [x] CDN manifest
- [x] IndexedDB cache
- [x] Local folder mount
- [ ] CDN proxy finalization
- [ ] Better cache validation
- [ ] Asset browser/debug tools

### Phase 3 — Unreal package parsing

- [ ] `.unr` map loading
- [ ] `.utx` texture parsing
- [ ] `.usx` static mesh parsing
- [ ] `.ukx` animation/model parsing
- [ ] Material translation to Three.js

### Phase 4 — Real world rendering

- [ ] Load real map geometry
- [ ] Render static meshes
- [ ] Render textures/materials
- [ ] Spawn player placeholder
- [ ] Basic camera/player movement

### Phase 5 — Playable prototype

- [ ] Character enter world packet flow
- [ ] Movement sync
- [ ] Object spawn packets
- [ ] NPC/player visibility
- [ ] Chat/system messages
- [ ] Basic interactions

---

## Development

Εγκατάσταση dependencies:

```bash
npm install
```

Development server:

```bash
npm run dev
```

Production build:

```bash
npm run build
```

Preview build:

```bash
npm run preview
```

Lint:

```bash
npm run lint
```

Format:

```bash
npm run format
```

---

## Σημαντικές σημειώσεις

Το project είναι πειραματικό και εξαρτάται από:

- Το protocol revision του server
- Την έκδοση / chronicle του Lineage II server
- Τη συμπεριφορά του login server
- Τη διαθεσιμότητα TCP socket bridge runtime
- Τη σωστή πρόσβαση σε client assets

Διαφορετικά server builds μπορεί να χρειάζονται αλλαγές στα packets ή στο parsing.

---

## Ασφάλεια

Το bridge πρέπει πάντα να έχει περιορισμούς.

Δεν πρέπει να λειτουργεί ως open TCP proxy.

Συστήνεται:

- Allowlist σε hostnames
- Allowlist σε ports
- HTTPS/WSS σε production
- Καθόλου credentials σε logs
- Rate limiting σε public deployment
- Προσοχή σε debug protocol logs

---

## Στόχος project

Ο στόχος δεν είναι απλά να φτιαχτεί ένα website για Lineage II server.

Ο στόχος είναι να δημιουργηθεί ένα πραγματικό browser-based L2 client experiment που μπορεί σταδιακά να εξελιχθεί από launcher/protocol prototype σε WebGL client με asset streaming και πραγματικό world rendering.

---

## Disclaimer

Το project είναι fan-made / experimental research project.

Δεν συνδέεται, δεν υποστηρίζεται και δεν είναι affiliated με την NCSOFT ή το επίσημο Lineage II.

Όλα τα trademarks ανήκουν στους αντίστοιχους ιδιοκτήτες τους.
