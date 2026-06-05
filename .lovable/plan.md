## Στόχος

Να εγκατασταθεί αυτούσιο το `l2online_ingame_hud.zip` που ανέβασες — αυτό αντικαθιστά τον υπάρχοντα desktop HUD (`L2HudAuthentic` / placeholder DesktopHud) με τον `XdatHud` που είναι χτισμένος 1:1 από τη γεωμετρία του xdat + τα πραγματικά client sprites.

## Τι κάνει το πακέτο

- **Top-left**: Player status (level badge, name, CP/HP/MP gauges) — bound live στο `activeChar` snapshot από τα packets.
- **Top-right**: Minimap frame 168×168.
- **Right edge**: Vertical menu (Inventory, Action, Skills, Quest, Party, Clan, Map, System).
- **Bottom-center**: 12-slot shortcut hotbar με τα πραγματικά `ItemWindow_DF_SlotBox_Default` slots.
- **Bottom-right**: Main menu bar, με το τελευταίο κουμπί να καλεί `onExit` (leave world).
- **Bottom-left**: Chat με scroll + input (Enter → `onSendChat`).
- **Bottom**: full-width EXP bar.
- Όλα σε baseline 1024 × `uiScale`, οπότε κλιμακώνεται όπως ο native client.

## Αρχεία που μπαίνουν / αλλάζουν

| Path | Action | Source |
|---|---|---|
| `public/hud/xdat-hud.json` | NEW (33 KB) | from zip |
| `public/hud/gauges/{CP,HP,MP,EXP}_{bg,fill}.png` | NEW (8 αρχεία) | from zip |
| `src/components/hud/XdatHud.tsx` | NEW | from zip |
| `src/routes/world.tsx` | MODIFY — desktop branch να φορτώνει `XdatHud` αντί για `L2HudAuthentic` | adapted |

Το mobile branch (`MobileGameHud` + `RotateDeviceOverlay` + fullscreen/orientation lock) **μένει ως έχει** — η αλλαγή είναι μόνο για το desktop.

Δεν διαγράφουμε το `L2HudAuthentic.tsx` / `L2Hud.tsx` / `DesktopHud.tsx` — μένουν στο repo (μπορεί να χρησιμοποιούνται από `/characters`, `L2DesktopStage` κλπ.). Απλώς το `/world` δείχνει πλέον στον νέο HUD.

## Επιβεβαίωση πριν τη χρήση

Μετά την εγκατάσταση θα ανοίξω preview στο `/world` (αν υπάρχει ενεργή σύνδεση) για να επιβεβαιώσω ότι ο HUD φορτώνει χωρίς runtime errors και τα sprites resolvάρουν μέσω `SpriteProvider`.

## Εκτός σκοπού

- Δεν αγγίζω το mobile HUD.
- Δεν αλλάζω τη λογική packets / game-state.
- Δεν προσθέτω νέα windows (inventory/skills popups) — τα κουμπιά μένουν visual για τώρα, όπως ήρθαν.
