# Apply richer character roster parsing

## 1. Replace `src/lib/l2-protocol/game-client.ts`

Overwrite with the uploaded version. The only meaningful diff vs current:

- `GameCharacter` gains `hp`, `mp`, `sp`, `expPercent`.
- `parseCharSelectionInfo` no longer `r.skip(...)`s the stat block — it now reads:
  - `hp = r.f64()` (current HP, == max at char select)
  - `mp = r.f64()` (current MP)
  - `sp = Number(r.u64())`
  - skips absolute exp (`r.u64()`)
  - `expPct = r.f64()` → stored as `expPercent = expPct * 100`
  - then `level = r.u32()`
- Everything else (world entity layer, opcodes, encryption, EnterWorld, NpcInfo/Move/Delete parsing, action senders) stays byte-identical.

No other files in `src/lib/l2-protocol/` are touched.

## 2. Wire real stats into `src/routes/characters.tsx`

In the center-bottom stats panel (currently shows `"—"` placeholders), use the new fields on `sel`:

- HP row: `value="{hp} / {hp}"`, `pct={1}` (full at char-select).
- MP row: `value="{mp} / {mp}"`, `pct={1}`.
- VP row: leave as-is (no data yet).
- XP row: `value="{expPercent.toFixed(4)}%"`, `pct={expPercent/100}`.
- SP row (the bottom flex line): replace the `race` text in the middle with `SP {sp.toLocaleString()}`, keep `Rep. 0` on the right, and move race into the small header line under the name (`Lv.X {klass} · {race}`).

Values are rounded with `| 0` for HP/MP so we don't show floats like `2122.0`.

No styling, layout, or other UI changes. Sessions that already cached an older roster in `sessionStorage` will show `NaN`/`undefined` until next login — acceptable (next login re-parses with the new shape).

## 3. Out of scope

- No `UserInfo (0x32)` parsing yet (would give live current/max separately in-world).
- No textures / map-loader / xdat work — separate threads.
- No changes to `world.tsx`, viewport, HUD, or PWA files.

## Technical notes

- `PacketReader.f64()` / `u64()` already exist in `packets.ts` (used elsewhere in `parseCharSelected`), so no new reader methods are needed.
- `CHAR_TAIL_AFTER_LEVEL = 495` is unchanged — the bytes we now actively read were previously inside the skipped region between `serverId` and `level`, so the per-character footprint and tail offset stay correct.
