# Plan: S3 Mesh Worker + Asset Index Corrections

Ο Claude έχει δίκιο σε δύο σημεία. Πάμε να τα φτιάξουμε πρώτα, μετά γράφουμε τον S3 mesh worker.

## 1. Διόρθωση asset-index (objindex semantics)

Το `l2slave_objindex.json` είναι **objectName → packages**, όχι itemId → textures. Η σωστή αλυσίδα για armor (S7):

```text
itemId
  └─(Armorgrp.dat, section 7)─▶ mesh/texture name (π.χ. Fmagic_m031_u)
        └─(objindex)──────────▶ .ukx / .utx package
              └─(package open)─▶ export
```

Αλλαγές στο `src/lib/l2-protocol/asset-index.ts`:

- Μετονομασία `loadItemTextureIndex()` → `loadObjectPackageIndex()` και `findItemTexturePackages(itemId)` → `resolvePackageForObject(name)`. Επιστρέφει `string[]` (candidate packages) για ένα objectName.
- Διατήρηση των υπόλοιπων (`loadPackageIndex`, `findObjectPackages`, `findPackage`, `findObjectsByClass`, `prefetchAssetIndexes`, `clearAssetIndex`).
- Προσθήκη placeholder `armorgrp-resolver.ts` (κενό S7 stub) με υπογραφή `getArmorAssetName(itemId, slot) => string | null` που θα γεμίσει στο S7 όταν φορτώσουμε το Armorgrp.dat.

## 2. S3 — Skeletal Mesh Worker

Νέα αρχεία:

- `src/lib/l2-protocol/workers/mesh-worker.ts` — Web Worker (module type).
- `src/lib/l2-protocol/mesh-worker-client.ts` — main-thread client με Promise API.
- `src/lib/l2-protocol/ukx/` — pure decoders (καμία DOM/three εξάρτηση):
  - `name-table.ts` — compact32 + SIGN-bit UTF-16LE / ASCII branch (ver133/lic40).
  - `lazy-array-scan.ts` — chained scan: `pts(12) → wedges(10) → faces(12)` βάσει `skipOffset == nextStart`. Όχι full property parse.
  - `skeletal-mesh.ts` — orchestrator: package → export → geometry buffers.
  - `coord.ts` — `(x,y,z) → (x,z,y)`, scale `1/52.5`, winding flip helper (swap index `[i+1]` με `[i+2]`).

### Κρίσιμα σημεία (από Claude)

1. **Name table ver133/lic40**: διάβασε compact32 length· αν `SIGN bit` set → UTF-16LE (`len * 2` bytes), αλλιώς ASCII (`len` bytes). Χωρίς αυτό σπάει όλο το name table.
2. **Geometry = lazy-array chain scan**, όχι property reflection. Detect by `skipOffset == nextStart`, σειρά `pts(12B) / wedges(10B) / faces(12B)`.
3. **Coords**: `(x,y,z) → (x,z,y)` + winding flip. **DXT απευθείας** ως `THREE.CompressedTexture` (DXT1/3/5) — καμία RGBA αποκωδικοποίηση.

### Worker contract (transferable)

Request:
```ts
{ kind: 'decode-mesh', packageBytes: ArrayBuffer, exportName: string, opts?: { flipWinding: boolean } }
```

Response (transfer όλα τα buffers):
```ts
{
  ok: true,
  positions: Float32Array,   // (x,z,y) scaled
  normals:   Float32Array,
  uvs:       Float32Array,
  indices:   Uint32Array,    // winding-flipped
  bones?:    { names: string[], parents: Int16Array, bindPose: Float32Array },
  skin?:     { jointIndices: Uint16Array, weights: Float32Array },
  materials: Array<{ slot: number, textureRef: string | null }>
}
```

Main thread: `postMessage(req, [packageBytes])`, στο response `transfer` όλα τα typed arrays πίσω. Έτσι μηδέν blocking στο main.

### Texture handoff (για S15)

`mesh-worker-client.ts` ΔΕΝ ασχολείται με textures. Επιστρέφει `materials[].textureRef` (objectName). Ο consumer (S15 preview) τρέχει `resolvePackageForObject` και φορτώνει το `.utx` ξεχωριστά, decode DXT → `CompressedTexture` στο main thread (μικρή δουλειά, GPU upload).

## 3. Test case scaffolding

Νέο `src/lib/l2-protocol/ukx/__tests__/mesh-decoder.fixture.ts` placeholder — περιμένουμε από Claude συγκεκριμένο objectName + expected verts/tris counts για smoke test. Θα προστεθεί όταν έρθει το fixture.

## Out of scope σε αυτό το step

- S7 Armorgrp.dat parser (μόνο stub).
- S15 char-select 3D preview (επόμενο step, καταναλώνει τον worker).
- Animation tracks (S16) — ο worker τώρα βγάζει μόνο bind pose.

## Files

Edited:
- `src/lib/l2-protocol/asset-index.ts` (rename helpers, no behavior regression για τα υπόλοιπα consumers)
- `src/routes/world.tsx` (αν χρειαστεί ονομαστική αλλαγή στο prefetch — αλλιώς άθικτο)

Created:
- `src/lib/l2-protocol/armorgrp-resolver.ts` (stub)
- `src/lib/l2-protocol/workers/mesh-worker.ts`
- `src/lib/l2-protocol/mesh-worker-client.ts`
- `src/lib/l2-protocol/ukx/name-table.ts`
- `src/lib/l2-protocol/ukx/lazy-array-scan.ts`
- `src/lib/l2-protocol/ukx/skeletal-mesh.ts`
- `src/lib/l2-protocol/ukx/coord.ts`
- `src/lib/l2-protocol/ukx/__tests__/mesh-decoder.fixture.ts`

Μόλις εγκρίνεις, πάω σε build mode και τα γράφω. Αν έχεις ήδη το test case object name από Claude, στείλ' το για να μπει κατευθείαν στο fixture.
