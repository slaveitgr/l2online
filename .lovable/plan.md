## Fix

### 1) `src/routes/index.tsx`
- Line 9: `const INTERLUDE_GAME_PROTOCOL = 746;` → `const GAME_PROTOCOL = 502;` (Mobius 12.3 Superion)
- Line 124: replace `INTERLUDE_GAME_PROTOCOL` usage with `GAME_PROTOCOL`

### 2) `src/lib/l2-protocol/game-client.ts` — KeyPacket result check
Στο handler του opcode `0x2e`, διάβασε το `result` byte (`body[1]`) και αν είναι `!== 0x01`, κάνε `settle({ type: "error", error: ... })` με καθαρό μήνυμα:
`Server rejected protocol <N> (KeyPacket result=0). Expected 502.`
Αυτό αντικαθιστά το σιωπηλό `tcp-eof` με readable error.

### Out of scope
Login server / GameCrypt / AuthLogin / CharSelectionInfo parser μένουν ως έχουν. Ο parser του 502 layout που μπήκε στο προηγούμενο βήμα θα δοκιμαστεί μόλις περάσει το KeyPacket με `result=1`.

### Verification
Log πρέπει να δείξει:
```
[GS] → ProtocolVersion 0x1f6        (= 502)
[GS] ← key 26B 2e 01 ...             (result byte = 0x01)
[GS] cipher ok=1 seed=...
[GS] → AuthLogin user="mslave"
[GS] ← op 0x09 ...
[GS] parsed N character(s)
```
