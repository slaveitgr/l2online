## Phase 1b — CDN streaming (αντικαθιστά το folder upload)

Το manifest σου είναι gold. Το CDN σερβίρει `200 OK` + `accept-ranges: bytes` + `cache-control: max-age=2592000` (30 ημέρες) — άρα partial reads και cache δουλεύουν. **Αλλά δεν στέλνει `Access-Control-Allow-Origin`**, οπότε ο browser μπλοκάρει direct fetches από το lovable domain. Λύση: TanStack server route proxy.

### Τι θα χτιστεί

**1. Bundle manifest** — `public/cdn-manifest.json` (αντίγραφο του δικού σου, 2.5 MB) ώστε να φορτώνεται instant χωρίς CDN roundtrip. Το `base_url` παραμένει `https://l2client.slave.gr/updater/files`.

**2. CORS proxy server route** — `src/routes/api/cdn/$.ts`:
- `GET /api/cdn/Maps/19_22.unr` → forward σε `https://l2client.slave.gr/updater/files/Maps/19_22.unr`
- Passthrough του `Range` request header → `Range` response header (για streaming μεγάλων αρχείων χωρίς να γεμίζει η μνήμη)
- Cache headers: `cache-control: public, max-age=2592000, immutable` (το sha256 είναι content-addressed effectively)
- Allowlist: μόνο paths που υπάρχουν στο manifest (anti-abuse)

**3. Refactor `src/lib/l2-assets.ts`**:
- Νέα `CDNManifest` interface (parse `cdn-manifest.json` σε Map για O(1) lookup ανά path)
- `getFile(relPath)` →
  1. IndexedDB hit; επιστροφή
  2. Miss → `fetch('/api/cdn/' + path)` → integrity check με sha256 → `IDB.put` → return
- `prefetchFolder(folder, onProgress)` → bulk download με concurrency limit (πχ 6 παράλληλα), progress callback
- Νέα `getStats()` → cached size, total size, % per folder
- Κρατάμε το `indexClientFiles` ως fallback "advanced: upload local copy"

**4. Νέα route `/cdn-cache`** (αντικαθιστά το current `/select-files` ως default flow):
- Header: "Lineage 2 — Asset Distribution"
- Manifest stats: 4.652 files / 34.96 GB total, X cached
- Folder table με ανά γραμμή: όνομα · file count · size · cached% · `[Prefetch]` button
- Default action: **"Prefetch Essentials" button** που κατεβάζει `system/` (0.49 GB) + `Maps/` (3.11 GB) = ~3.6 GB
- Live progress bar (files done / total bytes / MB/s)
- "Clear cache" + "Upload local folder instead" (existing flow)

**5. Update flow**:
- `/` Launcher → "Enter game" → check cache state
  - Αν `system/` cached → πάει σε `/characters`
  - Αλλιώς → redirect σε `/cdn-cache` με prompt
- `/select-files` παραμένει για όσους θέλουν local upload

**6. `WorldViewport` HUD** — δείχνει "Cache: 3.42 GB / 34.96 GB · 412 files" + live download bar όταν ο loader ζητάει νέο file.

### Out of scope (Phase 2)

- Πραγματικό parsing των `.unr/.utx/.ukx` (Salvation-era UE2.5 — `Lineage2JS` parsers χρειάζονται port)
- WebSocket networking με τον L2jMobius server
- Καθαρισμός cache με LRU eviction (απλό clear-all για τώρα)

### Τεχνικά risk notes

- **Bandwidth στον server σου**: 35 GB × visitors. Cloudflare cache helps, αλλά πρόσεξε το egress. Για demo OK.
- **IndexedDB quota**: browsers επιτρέπουν συνήθως 60% του free disk. 3.6 GB περνάει σε >90% των desktops. Θα δείχνουμε `navigator.storage.estimate()`.
- **Cloudflare timeout**: τα >100 MB αρχεία (π.χ. `branch.ukx` = 138 MB) χρειάζονται streaming proxy — `response.body` pipe-through, όχι `.arrayBuffer()` στον server.
- **sha256 integrity** γίνεται client-side μετά το download (Web Crypto `crypto.subtle.digest`).

### Files που αλλάζουν

```text
public/cdn-manifest.json         (νέο — copy του uploaded)
src/lib/l2-assets.ts             (refactor: CDN-first)
src/lib/cdn-manifest.ts          (νέο — typed loader/lookup)
src/routes/api/cdn/$.ts          (νέο — CORS proxy)
src/routes/cdn-cache.tsx         (νέο — main UI)
src/routes/index.tsx             (update: smart redirect)
src/components/WorldViewport.tsx (HUD update)
```
