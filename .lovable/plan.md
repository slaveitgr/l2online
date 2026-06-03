# Ενσωμάτωση Authentic L2 UI (πραγματικά client sprites)

Το archive φέρνει 1.638 PNG sprites (24MB) που έχουν αποκωδικοποιηθεί από τα πραγματικά L2 `SysTextures/*.utx` + 4 νέα αρχεία κώδικα που τα οδηγούν. Το `tools.zip` είναι offline pipeline scripts (Node).

## 1. Sprite assets → `public/hud/`

Unzip του `l2online_hud_sprites.zip` μέσα στο `public/`:

```
public/hud/ui/manifest.json
public/hud/ui/L2UI_CT1/*.png      (~1.615 chrome sprites)
public/hud/ui/L2UI_NewTex/*.png
public/hud/ui/L2UI_CH3/*.png
public/hud/ui/L2UI_EPIC/*.png
public/hud/ui/BMProduct/*.png
public/hud/ui/Default/*.png
public/hud/ui/LineageDecosTex/*.png
public/hud/gauges/{CP,HP,MP,EXP,VP}_{bg,fill}.png
```

Σερβίρονται static από `/hud/...` — το `loadSprites()` κάνει `fetch("/hud/ui/manifest.json")`.

## 2. Νέα/αντικαταστάσιμα source αρχεία

| Αρχείο | Ενέργεια |
|---|---|
| `src/lib/l2-protocol/l2-ui-sprites.ts` | **Νέο** — sprite registry (resolves xdat refs σε PNG urls, 9-slice insets, canonical `UI.*` refs). |
| `src/components/hud/L2Sprite.tsx` | **Νέο** — `SpriteProvider`, `L2Sprite`, `L2Frame` (9-slice), `L2Button` (3-state), `L2Slot`, `L2Checkbox`, `L2Tab`. |
| `src/components/hud/L2Gauge.tsx` | **Αντικατάσταση** — από abstract gauge σε πραγματικά `Gauge_DF_Large_{HP,MP,CP,EXP,VP}` strip sprites. |
| `src/components/hud/L2HudAuthentic.tsx` | **Αντικατάσταση** — wired με `getGameConnection().addListener` (player/char-selected events) + νέα primitives. Παραμένει το ίδιο API (`<L2HudAuthentic uiScale={1.35}/>`). |

Σημείωση: τα αρχεία του archive ορίζουν imports `@/components/l2/...`. Θα τα ρυθμίσω σε `@/components/hud/...` για να ταιριάζουν με τη δομή του project (καθώς ο υπόλοιπος HUD είναι εκεί).

## 3. Mount στο `/world`

Στο `src/routes/world.tsx`, wrap το mobile/desktop HUD render σε `<SpriteProvider>` (single provider — manifest fetch γίνεται μία φορά). Δεν αλλάζει το game viewport/scene logic.

## 4. Tools (offline pipeline)

Τα `.mjs` scripts είναι για τοπικό decode pipeline (διαβάζουν `.l2system-index/` που δεν υπάρχει στο cloud project). Αποθηκεύονται **ως reference μόνο** στο `tools/` του repo (όχι στο build) ώστε να τα έχεις διαθέσιμα όταν θες να ξανατρέξεις το extraction τοπικά.

## 5. Εκτός scope

- Δεν αγγίζει `game-client.ts`, `world.tsx` scene/viewport, char-select panel, ή PWA/manifest.
- Δεν αλλάζει το `L2Hud.tsx` (παλιό) — μένει σε περίπτωση που θες να γυρίσεις πίσω.
- Δεν αλλάζει build pipeline (24MB extra στο `public/` φορτώνεται lazy ανά sprite από το browser).

## Τεχνικές σημειώσεις

- `SpriteProvider` κάνει cache το manifest module-level, οπότε ασφαλές για re-mount.
- `L2Frame`/`L2Button` χρησιμοποιούν CSS `border-image` για 9-slice — zero JS overhead.
- Αν λείπει sprite, τα primitives κάνουν fallback σε plain border styling (graceful degrade).
- Το `useEffect` του `L2HudAuthentic` διαβάζει `sessionStorage.l2.activeChar` πριν συνδεθεί στον `getGameConnection()` — ίδιο pattern με το υπάρχον HUD.
