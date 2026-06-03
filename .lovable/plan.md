
# Mobile Game HUD πάνω από /world

Ξεχωριστό overlay layer για mobile, χωρίς να αγγίξουμε το desktop `L2HudAuthentic` ή το `WorldViewport` rendering. Επιλογή HUD γίνεται στο `world.tsx` με βάση mobile detection.

## Phase 1 — Foundations (αυτό το loop)

### 1. PWA landscape
- `public/manifest.webmanifest` με `display: fullscreen`, `orientation: landscape`, icons placeholders (192/512).
- `src/routes/__root.tsx` head(): προσθήκη `<link rel="manifest">`, `theme-color`, `mobile-web-app-capable`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`.
- `src/lib/mobile/orientation.ts`: `lockLandscape()` με try/catch γύρω από `screen.orientation.lock("landscape")`. Καλείται σε user gesture / on mount στο /world (silent fail σε browsers που δεν υποστηρίζουν).

**Σημείωση**: ΔΕΝ προσθέτουμε `vite-plugin-pwa` ή service worker — μόνο manifest για installability + orientation preference. Αυτό αποφεύγει cache/preview προβλήματα.

### 2. Mobile detection
- `src/hooks/useIsMobileGame.ts`: επιστρέφει `{ isMobile, isLandscape }` βάσει `matchMedia("(pointer: coarse)")` + viewport width < 900, με listeners για `resize` / `orientationchange`. SSR-safe (initial `false`, set στο `useEffect`).

### 3. Rotate overlay
- `src/components/mobile/RotateDeviceOverlay.tsx`: fullscreen z-9999 panel, semantic tokens (`text-gold`, `text-muted-foreground`).

### 4. Mobile HUD shell
- `src/components/mobile/MobileGameHud.tsx`: το layout από το μήνυμα — player panel (HP/MP/CP bars), minimap, chat toggle, virtual joystick, target panel, action buttons (attack/interact/potion + 4 skill slots). Tailwind arbitrary values (`bottom-[62px]`) όπου χρειάζεται. Props: `onAttack?`, `onInteract?`, `onMove?(dx, dy)`.
- `VirtualJoystick`: pointer events με `setPointerCapture`, υπολογίζει normalized dx/dy και καλεί `onMove` (Phase 2 το hooks σε packets).
- Όλα `pointer-events-none` στο outer, `pointer-events-auto` σε interactive children.

### 5. Glass UI CSS
- `src/styles.css` `@layer utilities`: `.l2-mobile-panel` (gold border, dark gradient, backdrop-blur, inset highlight) και `.mobile-game-hud` (`touch-action: none`, no select).

### 6. Wire-up στο /world
- `src/routes/world.tsx`: import hook + νέα components, conditional render — desktop ⇒ `L2HudAuthentic`, mobile portrait ⇒ `RotateDeviceOverlay`, mobile landscape ⇒ `MobileGameHud`. `useEffect` καλεί `lockLandscape()` όταν `isMobile`.

## Phase 2 — Action wiring (επόμενο loop, μόλις εγκριθεί η Phase 1)

Προσθήκη methods στο `src/lib/l2-protocol/game-client.ts`:
- `sendMoveTo(x, y, z)`
- `sendAttack(objectId)`
- `sendAction(objectId)` (target / interact)
- `sendSay(text, channel)`

Το `MobileGameHud` καλεί `getGameConnection()?.sendXxx(...)`. Το UI δεν φτιάχνει bytes — μόνο calls. Στη συνέχεια tap-to-target / tap-to-move από το canvas (raycast στο `WorldViewport`, expose callback prop).

## Out of scope τώρα

- Service worker / offline.
- Πραγματικά εικονίδια PWA (placeholders).
- Skill cooldowns, drag-to-rearrange skillbar, inventory UI.
- Καμία αλλαγή σε desktop HUD ή Three.js scene.

## Files

**New**: `public/manifest.webmanifest`, `src/lib/mobile/orientation.ts`, `src/hooks/useIsMobileGame.ts`, `src/components/mobile/RotateDeviceOverlay.tsx`, `src/components/mobile/MobileGameHud.tsx`.

**Edited**: `src/routes/__root.tsx` (head links), `src/styles.css` (utilities), `src/routes/world.tsx` (conditional HUD).

Έτοιμος να προχωρήσω με Phase 1 μόλις πεις ναι;
