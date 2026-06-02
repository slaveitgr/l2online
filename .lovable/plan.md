
# Πιστή αναπαραγωγή του αυθεντικού L2 UI

Στόχος: τα τρία screens (Login / Server Select / Character Select) να μοιάζουν με τον πραγματικό client αντί για το τωρινό "fantasy launcher" look.

## Κοινά design tokens (src/styles.css)

- Fullscreen artwork ως background (cover, no panels χρώματος), χωρίς το radial gradient που υπάρχει σήμερα στο body.
- Νέο `.l2-frame` utility: μικρό modal με μαύρο gradient fill (`oklch(0.10 0 0 / 0.85)`), 1px gold border (`#a88a4a`), inset highlight, ελαφρύ outer glow — αυτό το "etched bronze plate" frame που έχουν όλα τα L2 panels.
- Νέο `.l2-button`: pill-shaped, σκοτεινό μπλε-μαύρο gradient με thin gold stroke, μικρό uppercase serif text (Cinzel ή system serif), hover = brighten + subtle gold glow.
- Νέο `.l2-input`: ίδιο pill frame αλλά κενό κέντρο, centered placeholder text σε muted gold.
- Footer bar: λεπτή σκούρα μπάρα κάτω-κάτω με `NC | LINEAGE II` + `4game.com` + copyright (όπως στα screenshots).
- Side menu (κάτω-δεξιά): mini vertical list `New Account / Lost Account / Links / Settings` με μικρά iconάκια, ultra-thin type.

## 1. Login screen (`src/routes/index.tsx`)

Refactor μόνο της παρουσίασης — η login logic, οι l2-bridge calls, και το protocol log μένουν ίδια.

- Fullscreen background: το "chained beast" artwork (gradient placeholder από CSS αν δεν υπάρχει asset, με slot για να μπει αργότερα real image).
- Κεντρικά κάτω από το μέσο: μικρό `l2-frame` με δύο inputs (Username, Password) στοιβαγμένα, και δύο buttons δίπλα-δίπλα `Log In` / `Exit`. Πολύ compact (max-w ~360px).
- Πάνω από τα inputs: server/status indicators (τωρινό status badge), σε μία γραμμή με thin type.
- Κάτω-δεξιά corner menu (New Account / Lost Account / Links / Settings) — links σε εξωτερικά docs ή noop για τώρα.
- Footer bar.
- Protocol log: μετακινείται σε collapsible κάτω-αριστερά (τύπου `<details>` με `Credits/Exit` style), για να μη χαλάει την εικόνα.

## 2. Server Select (νέο intermediate state ή dialog στο index)

Στο πραγματικό client, μετά το login εμφανίζεται μικρό dialog `Server: [list]  [OK] [Cancel]`. Σήμερα η εφαρμογή πάει κατευθείαν από login → characters. 

- Προσθήκη state `phase: "login" | "server-select" | "loading"` στο `index.tsx`.
- Όταν έρθει η server list, εμφανίζεται modal `l2-frame` πάνω από το ίδιο background: label `Server`, dropdown με τα ονόματα servers, ετικέτες `Lineage 2` / `Light` indicators, `OK` / `Cancel` buttons.
- `OK` → προχωράει στο GS handshake (όπως τώρα γίνεται αυτόματα).
- `Cancel` → επιστροφή στο login frame.

## 3. Character Select (`src/routes/characters.tsx`)

Πλήρης οπτική αναμόρφωση για να μοιάζει με το screenshot #1.

Layout:
```
┌─────────────────────────────────────────────────────────────┐
│ Select Character                                            │  ← top-left label, no header bar
│                                                             │
│         [FULLSCREEN CITY/CHARACTER ARTWORK]      ┌────────┐ │
│                                                  │ slot 1 │ │ ← right column
│                                                  │ slot 2 │ │   character cards
│                                                  │   +    │ │   (compact, gold-bordered)
│                                                  │   +    │ │
│                                                  └────────┘ │
│                                                             │
│                    ┌──────────────────┐                     │
│                    │ Name             │                     │
│                    │ Lv.X Class       │                     │
│                    │ HP ▓▓▓▓ MP ▓▓▓▓  │                     │  ← center-bottom stats panel
│                    │ XP ▓▓▓▓ SP 0     │                     │
│                    └──────────────────┘                     │
│                          [ Play ]                           │
│ Credits                                       Create Delete │  ← bottom corners
│ Exit                                                        │
└─────────────────────────────────────────────────────────────┘
```

Συγκεκριμένα:
- Background: fullscreen artwork (city skyline placeholder, με slot για asset).
- Top-left: μικρό text "Select Character" (όχι ολόκληρο header bar).
- Right column (w-64): vertical stack από character slots. Selected = highlighted gold border με thumbnail + `Lv.XX` + class + name. Empty slots = `+` πλακάκι.
- Bottom-center: compact stats panel (`l2-frame`) με HP/MP/VP/XP/SP bars (HP=κόκκινο, MP=μπλε, VP=πορτοκαλί, XP=γκρι), και name/level/class από πάνω.
- Bottom-center κάτω από stats: `[ Play ]` button (l2-button, large).
- Bottom-left: `Credits` και `Exit` plain text buttons (small, low-key).
- Bottom-right: `Create` και `Delete` plain text buttons.
- Αφαίρεση: του τωρινού huge avatar circle, του gradient overlay, του "ENTERING…" button — γίνεται plain `Play` με loading state.
- Protocol log: collapsible `<details>` που εμφανίζεται μόνο while entering ή on error (κάτω-αριστερά πάνω από Credits/Exit).

## Out of scope

- Δεν αλλάζει καμία logic σε login/GS handshake/protocol parsing.
- Δεν αλλάζει το `/world` route.
- Δεν φέρνουμε πραγματικά game assets (artworks/icons) — αφήνουμε placeholders/CSS gradients με σαφή slots ώστε να γίνει drop-in αργότερα.

## Technical notes

- Όλες οι νέες κλάσεις (`l2-frame`, `l2-button`, `l2-input`, `l2-stat-bar`) μπαίνουν στο `@layer utilities` του `src/styles.css` ώστε να χρησιμοποιούν τα ήδη υπάρχοντα tokens (gold, blood, panel).
- Καμία νέα dependency.
- 3 αρχεία αλλάζουν: `src/styles.css`, `src/routes/index.tsx`, `src/routes/characters.tsx`.
