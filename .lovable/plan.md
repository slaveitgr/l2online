# Phase 2 — Mobile HUD action wiring

Συνδέουμε το `MobileGameHud` με το game/network layer και προσθέτουμε tap-to-target / tap-to-move από το 3D canvas. Μόνο frontend + protocol calls, χωρίς αλλαγές σε scene rendering ή desktop HUD.

## 1. Game client send methods

Επέκταση `src/lib/l2-protocol/game-client.ts` με public methods:

- `sendMoveTo(x: number, y: number, z: number)` — MoveBackwardToLocation (0x01)
- `sendAttack(objectId: number)` — Attack (0x01? ή ανάλογα build) με origin x/y/z + shift flag
- `sendAction(objectId: number, shift?: boolean)` — Action (0x04) για target / interact / talk to NPC
- `sendSay(text: string, channel?: number)` — Say2 (0x49) με default channel ALL=0

Κάθε method:
- noop αν `!this.connected`
- φτιάχνει το packet bytes με τα ήδη υπάρχοντα helpers του project (writer/encryption pipeline που χρησιμοποιείται για AuthLogin κλπ)
- περνά από το ίδιο encrypt+send path

Δεν αλλάζουμε υπάρχουσες handlers ή event types.

## 2. Selected target state

Νέο lightweight store `src/lib/game-state.ts` (Zustand-free, plain module + listeners ή ένα μικρό `useSyncExternalStore` hook):

- `selectedTargetId: number | null`
- `setSelectedTarget(id, meta?)`
- `useSelectedTarget()` hook

Έτσι το `MobileGameHud` και το `WorldViewport` μοιράζονται target χωρίς prop drilling μέσα από το `world.tsx`.

## 3. Tap-to-target / tap-to-move στο WorldViewport

Στο `src/components/WorldViewport.tsx`:

- Προσθήκη `onPointerDown` listener στο canvas:
  - raycast στους loaded actor meshes (έχουν ήδη userData με objectId αν είναι entity)
  - αν hit entity → `setSelectedTarget(objectId)` + `props.onTargetTap?.(id)`
  - αν hit ground → υπολόγισε world (x,y,z) → `props.onGroundTap?.(x,y,z)`
- Mobile-only: long-press (>250ms) στο ίδιο σημείο = move command (αντί για απλό tap). Για τώρα: απλό tap = target/move ανάλογα με hit.
- Camera touch controls μένουν ως έχουν.

Props (όλα optional, ώστε desktop usage να μην σπάει):
```ts
interface WorldViewportProps {
  onTargetTap?: (objectId: number) => void;
  onGroundTap?: (x: number, y: number, z: number) => void;
}
```

## 4. Wire-up στο world.tsx

```tsx
<WorldViewport
  onTargetTap={(id) => getGameConnection()?.sendAction(id)}
  onGroundTap={(x,y,z) => getGameConnection()?.sendMoveTo(x,y,z)}
/>
...
<MobileGameHud
  targetId={selectedTargetId}
  onAttack={() => { const id = getSelectedTarget(); if (id) getGameConnection()?.sendAttack(id); }}
  onInteract={() => { const id = getSelectedTarget(); if (id) getGameConnection()?.sendAction(id); }}
  onMove={(dx,dy) => { /* joystick → continuous move, see §5 */ }}
  onSay={(t) => getGameConnection()?.sendSay(t)}
/>
```

## 5. Joystick → movement

Joystick επιστρέφει normalized `dx,dy ∈ [-1,1]`. Στρατηγική:
- Όσο `|dx|+|dy| > 0.15`: κάθε ~300ms στέλνουμε `sendMoveTo(playerX + dx*R, playerY + dy*R, playerZ)` με `R ≈ 800` (L2 units). Στο release στέλνουμε ένα stop move (move-to current position).
- Throttling με `setInterval` που ζει όσο το joystick είναι active.

Player position: παίρνεται από το game-state (θα προστεθεί `selfPosition` που ενημερώνεται από world packets — αν δεν υπάρχει ακόμα, fallback σε (0,0,0) και TODO).

## 6. Target panel binding

Στο `MobileGameHud` το "No target" αντικαθίσταται με `targetId ? "Target #" + targetId : "No target"` (HP bar μένει placeholder 100% μέχρι να έρθουν stats από StatusUpdate packet — out of scope τώρα).

## Out of scope

- Real HP/MP/CP από character status packets (χωριστό loop).
- Skill cooldowns, skill packets (RequestMagicSkillUse).
- Inventory / item use packets.
- Pathfinding — βασιζόμαστε στο server-side movement validation.
- Καμία αλλαγή σε desktop HUD ή scene rendering.

## Files

**New**: `src/lib/game-state.ts`

**Edited**:
- `src/lib/l2-protocol/game-client.ts` (4 νέες send methods)
- `src/components/WorldViewport.tsx` (raycast + tap props)
- `src/components/mobile/MobileGameHud.tsx` (target binding, joystick throttle)
- `src/routes/world.tsx` (wire callbacks)

Πάμε;
