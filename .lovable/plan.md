
## Στόχος

Να ξαναχτίσουμε το `L2HudAuthentic` (desktop in-game HUD) ώστε να ταιριάζει pixel-by-pixel με το screenshot 1920x1080 που έδωσες, χρησιμοποιώντας τα ίδια τα crops του πραγματικού client (όχι placeholder generic UI). Καμία αλλαγή σε gameplay/3D/protocol — μόνο presentation layer.

## Ανάλυση του reference (από `crop_metadata.json`, βάση 1920x1080)

Όλα τα coords που ακολουθούν είναι από τα boxes του zip και θα χρησιμοποιηθούν ως ακριβής χάρτης τοποθέτησης.

| # | Section | Box (x1,y1,x2,y2) | Περιεχόμενο |
|---|---|---|---|
| 01 | Player status top-left | 0,0 → ~260,90 | Όνομα + level chip + CP/HP/MP/VP bars + 2 mini portraits (sun/moon, status) |
| 05 | Hotbars (κέντρο-κάτω) | 660,780 → 1310,1000 | 3 rows × 12 slots, top diamond/page controls, right scroll controls |
| 06 | Bottom EXP/status bar | 0,1000 → 1920,1080 | EXP label + bar + %, vitality/mail/clan/OFF, center system icons, right currency/weight, far-right count |
| 07 | Event panel top-right | 1490,0 → 1725,240 | Header (Clan/Alliance), Stage ring badge, checkbox "Not participating", Consolation Prize, Lucky Coin, Available Rewards + Receive |
| 08 | Quest Notification | 1585,365 → 1868,480 | Title bar + close, quest icon, "New Path", location/progress |
| 09 | Right vertical icon bar | 1848,0 → 1920,1020 | ~24 κάθετα κουμπιά (διαμάντια/εικονίδια), full-height, edge-aligned |
| 10 | Center nameplates/targets | 640,300 → 1210,760 | nameplate strings πάνω από characters (Invisible/Kavliaris/sklavos), target HP bar |
| 11 | Bottom-right action menu | 1450,915 → 1920,1080 | Πλέγμα 3×2 action buttons (potion/map/quest/etc.) πάνω από bottom bar |
| 12 | Floating shortcut panel | 1715,735 → 1810,880 | Στενό κάθετο panel με 4-5 slots (mail/cross/etc.) |

Επιπλέον στο screenshot: αριστερά-κάτω chat/system log (~0,720 → 380,1000) με γραμμές τύπου "HTML: html/admin/...", "SYS: You have been teleported to ...", "The attack has been blocked." σε ξεθωριασμένο γκρι/χρυσό.

## Τι ΥΠΑΡΧΕΙ ήδη και τι ΛΕΙΠΕΙ

Υπάρχοντα building blocks (θα τα ξανα-χρησιμοποιήσουμε):
- `L2Frame`, `L2Slot`, `L2Sprite` (πραγματικά client sprites από `L2UI_*.utx`)
- `L2Gauge` (HP/MP/CP/EXP bars με τα authentic gauge atlases)
- `L2SystemMenu`, `L2GameWindows`, `L2XdatWindow` (popups)
- `getGameConnection()` → player/HP/MP από το live protocol
- `setSelectedTarget` / `useSelectedTarget` για target HUD

Το σημερινό `L2HudAuthentic.tsx` είναι αρκετά γενικό (μικρό top-left panel, 12 generic right icons με emojis, μικρό 2×12 hotbar, μονό EXP bar). Δεν ταιριάζει με το screenshot στις θέσεις, στα μεγέθη, στο layout, στα icons.

## Πλάνο υλοποίησης

### 1) Αρχιτεκτονική: 1920×1080 virtual stage με auto-scale
Μόνο έτσι παίρνουμε πιστή αναπαραγωγή ανεξαρτήτως resolution.

- Νέο `src/components/hud/L2DesktopStage.tsx`: fixed 1920×1080 container, `transform: scale(min(vw/1920, vh/1080))` με `transform-origin: top left` και centered offset.
- Όλα τα HUD pieces θα τοποθετηθούν με `position:absolute` σε **απόλυτα pixel coords** του reference. Θα ξεκολλήσουμε από το σημερινό `uiScale` approach.
- Το `WorldViewport` (3D canvas) μένει σε full viewport από κάτω. Το HUD πάνω του.

### 2) Νέα δομή components (όλα κάτω από `src/components/hud/desktop/`)

- `DesktopHud.tsx` — το νέο root που αντικαθιστά το `L2HudAuthentic` στο `world.tsx`. Mounts όλα τα παρακάτω μέσα στο `L2DesktopStage`.
- `PlayerStatusPanel.tsx` — top-left: level chip, name, CP/HP/MP/VP bars (4 bars, στενά, με labels και αριθμούς όπως στο shot), mini sun/moon icon, status portrait.
- `RightIconRail.tsx` — δεξιά κάθετη κολώνα από 1848 ως 1920, full-height. Λίστα icons θα έρθει από `09_right_vertical_icon_bar/slots/right_slot_NN_*.png` (24 buttons). Render με `<img>` που pulls από τα crops (ως static assets).
- `EventPanel.tsx` — top-right Kavliaris event widget με stage ring, checkbox, consolation prize, lucky coin row, available rewards + Receive button.
- `QuestNotification.tsx` — title bar + close + quest icon + "New Path" + "Tarti (Training Zone) 0/1".
- `Hotbars.tsx` — 3 rows × 12 slots. Πάνω diamond/page controls + right scroll. Slot keybinds (F1/F4/F5/F9/1/2/3...). Drag/drop placeholder (κενά slots για τώρα). Στο row 1: εικονίδια από screenshot (sword, glove/F4, target/F5, kneel/F9). Στο row 2: empty page "2".
- `BottomStatusBar.tsx` — full-width EXP bar bottom με EXP label, bar, % (0.0000%), arrow up 200%, mail/clan/OFF, system icons row, weight 28/250, money 0/0/0.
- `BottomRightActionMenu.tsx` — 3×2 action grid (potion, map, quest, gather, mount, etc.) + extra book icon ("Cross!") αριστερά.
- `FloatingShortcutPanel.tsx` — μικρό κάθετο panel με 4-5 slots, draggable προαιρετικά.
- `ChatLog.tsx` — bottom-left chat/system log. Lines με χρώματα ανά prefix (HTML γκρι, SYS κίτρινο, "The attack has been blocked." γκρι, link γαλάζιο). Auto-scroll, fade older. Θα διαβάζει από `getGameConnection().addListener` για system messages.
- `Nameplates.tsx` — 3D-to-screen projection (όχι κανονικό overlay): αφήνουμε στο `WorldViewport` να συνεχίσει να ζωγραφίζει τα nameplates του όπως κάνει σήμερα — δεν αλλάζουμε τη μηχανική. Απλά styling-pass: όνομα selected target γίνεται γαλάζιο `[brackets]` με κόκκινη HP bar από κάτω.

### 3) Assets: ποια από τα crops θα χρησιμοποιηθούν live

Δεν θέλουμε να copy-paste-άρουμε όλα τα 663 PNG στο `public/`. Στόχος: χρησιμοποιούμε ήδη υπάρχοντα `L2Sprite`/`L2Frame`/`L2Gauge` (πραγματικά client sprites) όπου ήδη ταιριάζουν, και κατεβάζουμε ως static assets ΜΟΝΟ τα crops που δεν έχουμε ακόμα:

Θα προστεθούν στο `public/hud/desktop/`:
- `right_rail/right_slot_01..24.png` (24 buttons του right rail)
- `event_panel/header_clan_alliance.png`, `stage_ring.png`, `stage_icon_inner.png`, `lucky_coin.png`
- `quest_panel/quest_icon.png`
- `action_menu/button_01..06.png`
- `floating_panel/slot_01..05.png`
- `bottom_bar/system_icons_row.png` (ή split), `weight_icon.png`, `coin_icons.png`
- `hotbar/top_diamond_left.png`, `top_diamond_right.png`, `toggle_square_1.png`, `toggle_square_2.png`, `book_icon.png`, `gold_icon.png`, `right_control_01..05.png`

Τα CP/HP/MP/EXP bars **δεν** χρειάζονται crops — έχουμε ήδη authentic gauge atlases (`L2Gauge`).

### 4) Live data wiring (χωρίς να αγγίξουμε business logic)

Όλα τα data sources είναι ήδη εκεί:
- Player HP/MP/level/name: `getGameConnection().getPlayer()` + listener `player` event.
- Selected target: `useSelectedTarget()` από `src/lib/game-state.ts`.
- System messages → chat: επέκταση `GameEvent` δεν χρειάζεται· υπάρχει ήδη pathway μέσω listeners. Αν λείπει `chat` event, το `ChatLog` θα δείχνει default lines + οποιαδήποτε `system` events έρχονται ήδη.
- Open windows: re-use `L2SystemMenu` (X key), `L2XdatWindow`, `L2GameWindows`. Τα κουμπιά του right rail και του action menu θα ανοίγουν τα αντίστοιχα `L2XdatWindow` keys (inventory, character, skills, quest, map, friends, clan, mail, settings) χρησιμοποιώντας το ήδη υπάρχον dispatch.

### 5) Wiring στο route

- `src/routes/world.tsx`: αντικατάσταση `<L2HudAuthentic uiScale={...} />` με `<DesktopHud />` (μόνο σε desktop — `useIsMobileGame()` ήδη επιλέγει `MobileGameHud` για mobile, άρα το desktop branch αλλάζει μόνο).
- Το `L2HudAuthentic.tsx` ΔΕΝ διαγράφεται (το χρησιμοποιεί ίσως το `L2HudMockup` route ή αλλού), απλά δεν θα χρησιμοποιείται στο /world.

### 6) Verification

1. Build OK.
2. Σύγκριση side-by-side με το screenshot σε 1920×1080 viewport (browser tool).
3. Σύγκριση σε 1366×768 και 2560×1440 για να επιβεβαιωθεί το auto-scale (το stage μένει 16:9, letterbox από το 3D αν χρειάζεται — όχι πάνω από το hud).
4. Έλεγχος ότι τα live HP/MP/EXP κινούνται όταν αλλάζει ο player από το game-client.
5. Έλεγχος ότι το X ανοίγει system menu, F1–F9 πατήματα δείχνουν highlight στα αντίστοιχα hotbar slots.

## Τεχνικά σημεία

- Όλα τα νέα components σε TSX, χωρίς νέες deps.
- Χρώματα: gold `#c9a84c`, panel bg `rgba(12,13,14,0.72)`, line `#5a4c30`, txt `#d7d0bd`, muted `#8f8a7d` — προστίθενται ως design tokens στο `src/styles.css` (semantic: `--hud-gold`, `--hud-panel`, `--hud-line`, `--hud-text`, `--hud-muted`).
- Καμία hardcoded χρωμοκλάση Tailwind· χρήση tokens.
- Τα crops PNG προστίθενται σε `public/hud/desktop/...` και αναφέρονται με URL string (`/hud/desktop/...`), όχι imports.

## Εκτός scope σε αυτό το PR

- Πραγματικό drag-and-drop ικανοτήτων στα hotbar slots.
- Πλήρης λειτουργικότητα όλων των xdat windows (μένουν όπως είναι).
- Mobile HUD (αμετάβλητο).
- 3D nameplates engineering (μόνο styling-pass).

## Παραδοτέα αρχεία

Νέα:
- `src/components/hud/L2DesktopStage.tsx`
- `src/components/hud/desktop/DesktopHud.tsx`
- `src/components/hud/desktop/PlayerStatusPanel.tsx`
- `src/components/hud/desktop/RightIconRail.tsx`
- `src/components/hud/desktop/EventPanel.tsx`
- `src/components/hud/desktop/QuestNotification.tsx`
- `src/components/hud/desktop/Hotbars.tsx`
- `src/components/hud/desktop/BottomStatusBar.tsx`
- `src/components/hud/desktop/BottomRightActionMenu.tsx`
- `src/components/hud/desktop/FloatingShortcutPanel.tsx`
- `src/components/hud/desktop/ChatLog.tsx`
- `public/hud/desktop/**` (επιλεγμένα PNG από το zip)

Επεξεργασμένα:
- `src/routes/world.tsx` (swap desktop HUD)
- `src/styles.css` (HUD tokens)
