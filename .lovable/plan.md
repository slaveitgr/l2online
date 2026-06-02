# Real character list from Game Server

## Goal
Replace the hardcoded characters on `/characters` with the real character list returned by the game server, by completing the L2 handshake all the way from login → game server → `CharacterSelectionInfo`.

## Current state
- ✅ Login server flow works: Init → GGAuth → RequestAuthLogin → LoginOk → ServerList
- ❌ Missing: PlayOk request, Game Server connection, Game Server handshake, character list parsing
- ❌ `/characters` shows 3 hardcoded mock characters

## What needs to happen

### 1. Login server — request play permission (`RequestServerLogin`)
After the user picks a server from the list, send `RequestServerLogin` (opcode `0x02`) to the **login server** with:
- `sessionKey1` (from LoginOk)
- selected `serverId`

Server replies `PlayOk` (opcode `0x07`) containing `sessionKey2` (2×u32). Both session keys must be forwarded to the game server to prove we authenticated.

### 2. Open a second bridge to the Game Server
The bridge already accepts arbitrary `host`/`port`. Open a new WebSocket to `/api/l2-bridge?host=<gameIp>&port=<gamePort>` using the IP/port from the chosen `GameServer` entry. For Mobius Superion the gameserver uses its own protocol and Blowfish key — completely independent from the login server.

### 3. Game Server handshake (Mobius)
Sequence on the new TCP connection:
1. **TX `SendProtocolVersion`** (opcode `0x0E`) — `u32 protocol` (use the revision we received from Init, e.g. `0xc621`).
2. **RX `KeyPacket`** (opcode `0x2E`) — `u8 ok` + `16-byte Blowfish key` + flags. From this point on every game-server packet is Blowfish-encrypted with this key, **with checksum + padding**, and Mobius also applies an additive XOR cipher on the body (see `gameserver/network/GameClientEncryption.java`).
3. **TX `AuthLogin`** (opcode `0x2B`) — username (utf-16le, null-terminated) + 4×u32 session keys (key2low, key2high, key1low, key1high — order matters for Mobius).
4. **RX `CharacterSelectionInfo`** (opcode `0x09` or `0x13` depending on chronicle) — list of characters with name, class, race, level, location, equipment, etc.

### 4. New module: `src/lib/l2-protocol/game-client.ts`
- Mirror the structure of `login-client.ts`: WebSocket, packet framing (length-prefix u16 LE), Blowfish state machine, opcode dispatcher, event stream.
- Add **Mobius GameServer cipher**: an `enableCrypt(key)` step that initializes both Blowfish + the static XOR table used by `GameCrypt`.
- Handle minimum opcodes: `KeyPacket (0x2E)`, `CharacterSelectionInfo (0x09)`, `CharacterCreateSuccess/Fail` if needed later, `SystemMessage`, `ServerClose`.

### 5. Parse `CharacterSelectionInfo`
For each character, read: name (string), object id (u32), title (string), session id (u32), clan id (u32), builder level (u32), sex (u32), race id (u32), base class id (u32), active (u32), x/y/z (i32), hp/mp (f64), sp (u32), exp (u64), level (u32), karma/pk/pvp (u32), then paperdoll item ids + augmentation values, then transformation id, hair style/color/face, access level, etc. Exact field count varies per chronicle; we will inspect the actual packet bytes from the live server and decode just what `/characters` needs: **name, class id → display name, race, level**.

### 6. Wire UI
- After ServerList arrives, when user clicks **ENTER WORLD**, run step 1 → step 4 then `navigate({ to: "/characters" })` with the parsed character array passed via `sessionStorage`.
- Update `/characters` to read characters from `sessionStorage` instead of the `CHARS` constant. Keep current visual design.
- Show a loading / error overlay if the game-server connection fails.

## Technical notes
- All game-server packets use the same length-prefix u16 LE framing as login.
- Blowfish on game server is **little-endian block I/O** (same fix as login).
- Mobius `GameCrypt` adds 8 bytes to the input key on each en/decrypt — keep a per-direction key state.
- Class id → name mapping: ship a small `classes.ts` table (139 entries for Superion). For now we can use a partial table covering the user's actual chars and fall back to `Class #${id}`.
- Race id → name: 6 entries (Human, Elf, Dark Elf, Orc, Dwarf, Kamael).
- Bridge already proxies arbitrary host:port, no server-side change needed.

## Files
- new: `src/lib/l2-protocol/game-client.ts`
- new: `src/lib/l2-protocol/game-crypt.ts` (Mobius XOR + Blowfish wrapper)
- new: `src/lib/l2-protocol/classes.ts` (class id + race id tables)
- edit: `src/lib/l2-protocol/login-client.ts` — add `requestPlay(serverId)` that sends `RequestServerLogin` and emits `play-ok` with both session keys (keep the connection open or expose them so the UI can chain into game-server connect)
- edit: `src/routes/index.tsx` — on "ENTER WORLD", do PlayOk + game-server handshake, store characters, then navigate
- edit: `src/routes/characters.tsx` — read characters from `sessionStorage`, drop the `CHARS` mock

## Out of scope
- Entering the world / map streaming
- Character creation / deletion
- Re-authentication or session refresh
