# L2 Online

**L2 Online** είναι ένα πειραματικό **browser-based Lineage II web client**. Δεν είναι απλό site και δεν είναι μόνο launcher. Είναι προσπάθεια να τρέξει σταδιακά ένα Lineage II client flow μέσα από browser, με πραγματικό login/game protocol, live world state, asset parsing και WebGL rendering.

Στόχος του project είναι ένας web/mobile-first L2 client που μπορεί να δουλέψει σε desktop browser, PWA και μελλοντικά Android, χωρίς Windows client ή emulator.

> Status: **Alpha / Research Prototype**
>
> Το network foundation και το asset pipeline υπάρχουν ήδη. Το project μπορεί να κάνει login, server selection, game server handshake, character list, character select, EnterWorld και να λαμβάνει live world packets. Το rendering πραγματικών L2 assets έχει ξεκινήσει μέσω `.unr`, `.usx`, `.utx` parsing και Three.js map assembly.

---

## Τι έχει υλοποιηθεί

### Network / Protocol

Υπάρχει υλοποίηση για Lineage II Mobius / Superion style protocol `502`.

```text
Login Server
  Init
  GameGuard
  RSA Auth
  LoginOk / LoginFail
  ServerList
  RequestServerLogin
  PlayOk

Game Server
  ProtocolVersion
  KeyPacket
  AuthLogin
  CharSelectionInfo
  CharacterSelect
  CharSelected
  EnterWorld
  Live world packet stream
```

Ο browser μιλάει με Lineage II login/game server μέσω WebSocket-to-TCP bridge, επειδή ο browser δεν μπορεί να ανοίξει raw TCP sockets απευθείας.

### Live world layer

Ο game client κρατάει lightweight world state μετά το EnterWorld.

Υπάρχει ήδη parsing / event layer για:

- `CharSelectionInfo`
- `CharacterSelect`
- `CharSelected`
- `EnterWorld`
- `NpcInfo`
- `MoveToLocation`
- `DeleteObject`
- player state
- NPC/world entity map
- generic world packet stream

Αυτά τροφοδοτούν το `/world` viewport για live NPC markers, player marker, packet counter και HUD shell.

### Asset / package pipeline

Υπάρχει L2 Unreal package reader για πραγματικά client assets.

Υποστηρίζονται ήδη:

- Lineage2 package signature parsing
- XOR package decryption
- UE2 header parsing
- name/import/export tables
- compact index / compat32 decoding
- tagged properties
- object references
- `StaticMeshActor` placements
- `Location`, `Rotation`, `DrawScale`, `DrawScale3D`
- texture metadata
- DXT / RGBA texture extraction
- StaticMesh geometry extraction

### Map rendering

Υπάρχει map loader που συναρμολογεί πραγματικά L2 map sectors σε Three.js.

```text
.unr map
  ↓
StaticMeshActor placements
  ↓
StaticMesh reference
  ↓
.usx mesh package
  ↓
StaticMesh geometry
  ↓
Material / Texture reference
  ↓
.utx texture package
  ↓
Three.js InstancedMesh / material / texture
```

Το `/world` route φορτώνει mounted ή cached client files, ψάχνει για `.unr` map sector, διαβάζει actor placements και καλεί τον map loader για πραγματικά meshes/textures στο scene.

---

## Τεχνολογίες

- TanStack Start
- React 19
- TypeScript
- Vite
- TailwindCSS 4
- Three.js
- IndexedDB
- Cloudflare Workers sockets
- WebSocket-to-TCP bridge
- File System Access API

---

## Αρχιτεκτονική

```text
Browser
  │ WebSocket
  ▼
/api/l2-bridge
  │ raw TCP
  ▼
Lineage II Login Server / Game Server
```

Assets:

```text
Local mounted L2 folder
  ή
CDN manifest / IndexedDB cache
  ↓
Asset loader
  ↓
L2Package parser
  ↓
Map loader
  ↓
Three.js scene
```

---

## Routes

```text
/              Launcher / login screen
/characters    Character selection + CharacterSelect flow
/world         Live world viewport + HUD + map/entity rendering
/cdn-cache     CDN cache / asset management
/select-files  Local file/folder selection flow
/api/l2-bridge WebSocket-to-TCP bridge
```

---

## Βασικά modules

```text
src/lib/l2-protocol/
  login-client.ts       Login server protocol
  game-client.ts        Game server protocol, character select, EnterWorld, world packets
  game-crypt.ts         Game server encryption layer
  blowfish.ts           Login encryption
  rsa.ts                Login RSA auth block
  packets.ts            Packet reader/writer helpers

src/lib/
  l2-package.ts         L2/UE2 package parser, maps, meshes, textures
  map-loader.ts         Three.js map assembly from .unr/.usx/.utx
  l2-assets.ts          IndexedDB cache + CDN fetch
  local-mount.ts        File System Access API local client mount

src/components/
  WorldViewport.tsx     Three.js scene + live entities + map loader
  hud/                  L2-style HUD components
```

---

## Current progress

### Έτοιμο / σε λειτουργία

- [x] Browser launcher
- [x] WebSocket-to-TCP bridge
- [x] Login server handshake
- [x] RSA auth / GameGuard flow
- [x] ServerList parsing
- [x] PlayOk
- [x] Game server ProtocolVersion
- [x] KeyPacket handling
- [x] AuthLogin
- [x] CharSelectionInfo parsing
- [x] Character selection UI
- [x] CharacterSelect packet
- [x] CharSelected parsing
- [x] EnterWorld packet
- [x] Live world packet stream
- [x] Player state from CharSelected
- [x] NPC spawn/move/remove markers
- [x] IndexedDB asset cache
- [x] Local L2 folder mount
- [x] `.unr` map package parsing
- [x] `.usx` static mesh geometry parsing
- [x] `.utx` texture parsing
- [x] Three.js map assembly pipeline
- [x] L2-style HUD shell

### Επόμενα

- [ ] Full terrain sector rendering
- [ ] P8 / palette texture path
- [ ] Better material graph coverage
- [ ] Sector-based on-demand loading
- [ ] Mobile touch HUD / Android UX
- [ ] NetPing / keep-alive
- [ ] Click-to-move
- [ ] Movement packet send/receive
- [ ] Chat send/receive
- [ ] Targeting
- [ ] Basic combat loop
- [ ] UserInfo masked packet parser
- [ ] CharInfo parser για άλλους παίκτες
- [ ] Inventory / skills UI
- [ ] `.ukx` character models
- [ ] Skeletal animations
- [ ] Effects / particles

---

## Roadmap

### Milestone 1 — Live World Viewer

Να μπαίνεις στον κόσμο και να βλέπεις πραγματικό map section με live NPC/world markers.

- EnterWorld
- world packet stream
- NPC markers
- player marker
- map package loading
- static mesh loading
- basic texture loading
- HUD shell

### Milestone 2 — Minimal Playable Client

Να μπορεί ο χαρακτήρας να κινηθεί και να κάνει βασικές αλληλεπιδράσεις.

- keep-alive
- click-to-move
- movement packets
- chat
- targeting
- basic attack
- live HP/MP updates

### Milestone 3 — Mobile Web Client

Να γίνει touch-first για Android / PWA.

- tap-to-move
- pinch zoom
- mobile hotbar
- virtual joystick option
- compact chat
- mobile HUD layout
- performance mode

### Milestone 4 — Full Visual Layer

Να μοιάζει όλο και περισσότερο με κανονικό L2 client.

- terrain
- sky/water/lighting
- character models
- animations
- skill effects
- inventory / skills / target windows

---

## Development

```bash
npm install
npm run dev
npm run build
npm run preview
npm run lint
npm run format
```

---

## Σημαντικές σημειώσεις

Το project είναι experimental και εξαρτάται από:

- protocol revision του server
- Mobius/server build
- login/game server συμπεριφορά
- σωστή λειτουργία του WebSocket-to-TCP bridge
- πρόσβαση σε client assets
- browser support για WebGL / IndexedDB / File System Access API

Διαφορετικά chronicles ή server builds μπορεί να χρειάζονται διαφορετικά packet layouts.

---

## Security notes

Το bridge δεν πρέπει να γίνει open proxy.

Πρέπει να υπάρχουν:

- host allowlist
- port allowlist
- HTTPS/WSS σε production
- καθόλου credentials σε logs
- περιορισμένα debug logs σε public deployment

---

## Disclaimer

Το project είναι fan-made / experimental research project.

Δεν συνδέεται, δεν υποστηρίζεται και δεν είναι affiliated με την NCSOFT ή το επίσημο Lineage II.

Όλα τα trademarks ανήκουν στους αντίστοιχους ιδιοκτήτες τους.
