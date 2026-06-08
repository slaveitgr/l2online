
## Στόχος
1. Βάλε την ανεβασμένη `image-bg.png` (Aden city) ως background στο Character Select.
2. Υλοποίηση όλων των ενοτήτων 3–18 του `Webclient_Port_Spec` σε φάσεις (αντί για ένα τεράστιο commit), με typed modules + worker decoding + IndexedDB cache.

---

## Φάση 0 — Char Select background (γρήγορο, single-step)
- Upload `image-bg.png` ως Lovable Asset → `src/assets/charselect-bg.png.asset.json`.
- `src/components/hud/L2CharSelectScreen.tsx`: αντικατάσταση του `const BG = "/hud/screens/CharSelect.png"` με import του asset url. Κράτα `cover`/`center` fit.

---

## Φάση 1 — Foundations (sections 11, 12, 18)
Πρώτα τα cross-cutting, χωρίς αυτά τα επόμενα φέρνουν λευκά/αργά μοντέλα.
- **S11 Texture fallbacks** σε `src/lib/l2-assets.ts`: exact → `_ori` → startsWith → follow `Shader.Diffuse`.
- **S12 Asset index**: φόρτωσε `public/l2slave_index.jsonl` + `l2slave_objindex.json` (αν λείπουν, build από headers) → `src/lib/l2-asset-index.ts` με `lookup(object) → package`.
- **S18 Cache**: `src/lib/l2-cache.ts` (IndexedDB, key `name+size+CACHE_VERSION`) + `public/sw.js` Cache API για raw `.utx/.unr/.dat`. Worker pool + LRU 2 GB.

## Φάση 2 — Mesh/Texture pipeline (section 3)
- `src/workers/l2-mesh.worker.ts`: SkeletalMesh chain scan (pts→wedges→faces→influences), refskeleton scan.
- `src/workers/l2-texture.worker.ts`: parse `utx` props (Format/USize/VSize/Palette), top-mip locate· DXT → `THREE.CompressedTexture`, P8 → CPU palette decode.
- UE2→three convert helper (already partially in repo) — single source of truth.

## Φάση 3 — Char Select 1:1 (section 15) ← εκεί κουμπώνει το νέο bg
- Parse `CharSelectionInfo (0x09)` paperdoll με raw ids (ήδη γίνεται partial — επιβεβαίωση).
- 3D preview pawn (race/sex) + armor (S7 stub αρχικά) + weapon στο `Weapon_R_Bone`, variant culling regex `_m(\d{3})_..._([a-z]+)\.mo`.
- Camera close-up (~3m, h 1.15m), pawn left-shift, lookAt camera· backdrop quad παιδί κάμερας με το νέο Aden bg.

## Φάση 4 — Equipment & NPCs (sections 6, 7)
- **S7 Armor**: `Armorgrp.dat` lookup, bodyPrefix matching `_m###_[uglb]` + `_t###`, auto-calibration 48 perms × quat variants × 4 scales, top-2 skin weights, hide naked slot, 3s re-assert watchdog.
- **S6 NPC**: `Npcgrp.dat` → mesh+tex resolution, package alias map (`LineageMonster→LineageMonsters.ukx`), `NpcName-eu.dat` names. Hooks στον `npc-info` handler.

## Φάση 5 — World (sections 8, 9, 10)
- **S8 Maps**: `.unr` StaticMeshActor parser (Location/Rotation/DrawScale/StaticMesh ref) → `.usx` stream layout. Terrain: `TerrainInfo` (TerrainMap G16, layers, sectors, toWorld FCoords, heightmap, QuadVisibilityBitmap holes). Sector streaming με 3×3 ring, key `20+floor(x/32768)_18+floor(y/32768)`.
- **S9 Materials**: FinalBlend/Shader/TexPanner chain → three material flags (Masked/Translucent/Additive, TwoSided, emissive, animated UV).
- **S10 Server-authoritative movement**: MoveTo origin = `player.x/y/z` από τελευταίο `MoveToLocation` echo, grounding με ±3m server-z match, ποτέ Water plane.

## Φάση 6 — Other players & Combat (sections 4, 5, 14)
- **S4 CharInfo 0x31** parser → spawn other-player pawn, paperdoll dressing, MoveToLocation κίνηση. Patch `src/lib/l2-protocol/game-client.ts`.
- **S5 Combat**: parse Attack 0x33 / MyTargetSelected 0xB9 / Die 0x00· send Action 0x1F / AttackRequest 0x01· click λογική (1st=select, 2nd=attack, Ctrl=force, Shift=info) στο `WorldViewport`.
- **S14 Unknown-opcode logger**: log first occurrence (UserInfo 0x32, NpcInfo 0x21 variants, status/skill).

## Φάση 7 — UI & Admin (sections 13, 17)
- **S13 NpcHtml 0x19** queue: αν δεν είναι έτοιμο το HTML window, ξαναπροσπάθησε ~60s.
- **S17 Admin**: typed `//cmd` → `SendBypassBuildCmd 0x74`, link clicks → `RequestBypassToServer 0x23`. HTML link parsing μέσα στο `NpcDialog`.

## Φάση 8 — Animations (section 16, hardest)
- `MeshAnimation` parser ver133/lic40 (refBones, motions, FAnalogTrack quat/pos/time tracks, sequences με resync heuristic).
- Runtime skeleton bind + per-frame slerp localRotations. Anim packages per category (Magic.ukx, Fighter.ukx, LineageMonsters*/NPCs*).

---

## Τεχνικές σημειώσεις
- Όλα τα heavy decodes σε Web Workers (mesh, texture, dat, animation).
- Όλα τα new modules typed (`Mesh`, `RefBone`, `MotionChunk`, `Armor`, `NpcEntry`, `Sector`).
- UE2→three: pos `(x,y,z)→(x,z,y)`, αναστροφή winding, scale `1/52.5` — single helper.
- Coordinate sanity για κάθε νέο asset class.

---

## Παράδοση
- Φάση 0 ταυτόχρονα με την έγκριση (single small commit).
- Κάθε επόμενη φάση = χωριστό σύνολο αλλαγών, με σύντομο smoke test (login → char select → enter world) στο τέλος.
- Στο τέλος κάθε φάσης update στο `.lovable/plan.md` με τι κουμπώθηκε.

## Ερωτήσεις πριν το build
1. Να ξεκινήσουμε όντως ΟΛΕΣ τις φάσεις σειριακά (μεγάλο scope, πολλά credits) ή Φάση 0 + Φάση 1 τώρα και οι υπόλοιπες με ξεχωριστό «go» η κάθε μία;
2. Τα `l2slave_index.jsonl` / `l2slave_objindex.json` υπάρχουν ήδη να σερβιριστούν, ή να τα παράγουμε από headers στον client την πρώτη φορά;
