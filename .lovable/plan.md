# FIX 1 — Texture fallback chain στον NPC extractor

## Πού ζει το πρόβλημα

Στο runtime, το `src/lib/npc-mesh.ts` φορτώνει pre-extracted PNG (`/models/npc/tex/<sanitised>.png`). Όταν λείπει το PNG, το mesh μένει με ουδέτερο beige (`#b8ad97`). Άρα τα «λευκά φαντάσματα» = textures που ο **offline extractor** απέτυχε να βγάλει.

Ο extractor είναι το `tools/l2-extract-npc-textures.mjs`. Σήμερα, γρ. 108–114:

```js
const want = [exportName + "_ori", exportName];           // (1) _ori, (2) exact
for (const w of want) e = pkg.exps.find(...)
if (!e) e = pkg.exps.find(x => x.objectName.startsWith(exportName) && isTex(x)) // (3) prefix
```

Δύο τρύπες: σειρά είναι ανάποδη από το spec, και δεν ακολουθεί Shader/FinalBlend chains όταν το export δεν είναι Texture.

## Αλλαγή στον extractor

Στο `tools/l2-extract-npc-textures.mjs`:

**1. Διόρθωσε τη σειρά αναζήτησης** σε ακριβώς αυτή που ζητάς:
   1. exact `exportName` (Texture)
   2. `exportName + "_ori"` (Texture)
   3. `startsWith(exportName)` (Texture, εξαιρώντας `_sp/_sh/_n/_normal` που ήδη φιλτράρει το `notMap`)
   4. Αν το ταυτοποιημένο export είναι **Shader / FinalBlend / Modifier / TexEnvMap / TexPanner** (όχι Texture), ακολούθησε την αλυσίδα properties (Diffuse → Material → Texture). Δες παρακάτω.

**2. Πρόσθεσε Shader-chain follower** (`resolveTextureChain(pkg, e, depth=0)`):
   - Επανάχρηση της υπάρχουσας property-walk λογικής (όπως στο `readTexture` γρ. 47–48), αλλά αντί να μαζεύεις `Format/USize/VSize`, διάβασε τα ObjectProperty refs (`pt === 0x0a` με `ci()`) για ονόματα: `Diffuse`, `Material`, `Texture`, `FallbackMaterial`.
   - Το object-ref είναι compact int: αν `> 0` → δείκτης σε `exps` (ίδιο πακέτο, 1-based). Αν `< 0` → import (`imps[-ref-1]`), δηλ. όνομα export σε **άλλο .utx**. Στην περίπτωση import: άνοιξε το αντίστοιχο .utx (μέσω `loadUtx(otherPkg)` — το package όνομα προκύπτει από τον parent name στον import table — χρειάζεται να επεκταθεί ο import parser για να κρατάει και το package).
   - Επανάλαβε resolve στο νέο export. **Max depth 3**, guard με `Set<offset>` για κύκλους.
   - Αν φτάσεις σε Texture export → επιστροφή `readTexture(pkg, e)`.

**3. Επέκταση import parser** (γρ. 32): σήμερα κρατάει μόνο το όνομα του ClassName. Πρόσθεσε και το `packageName`: στο import row υπάρχουν δύο συμπληρωματικά name refs πριν το className — διάβασε το πρώτο (`packageName`) για να ξέρεις σε ποιο .utx να ψάξουμε. Επιστροφή `imps[i] = { className, packageName, objectName }`.

**4. Diagnostic όταν αποτυγχάνουν όλα τα βήματα 1-4:**
   ```js
   const nearest = pkg.exps
     .filter(x => isTex(x))
     .map(x => ({ name: x.objectName, d: levenshtein(x.objectName, exportName) }))
     .sort((a, b) => a.d - b.d)
     .slice(0, 5)
     .map(x => x.name);
   console.warn(`[tex-miss] ${full} — nearest: ${nearest.join(", ")}`);
   ```
   Σύντομη Levenshtein (≤30 γραμμές) inline στο tool — δεν προσθέτουμε dependency.

## Runtime touch (μικρή αλλαγή)

`src/lib/npc-mesh.ts` γρ. 90: το neutral material είναι ήδη beige `#b8ad97`. Άλλαξέ το σε **ουδέτερο γκρι** `#888888` (ή `0x888888`) όπως ζητάς, ώστε τα «λευκά» που προήλθαν από κάποιο άλλο code path να μην ξεγλιστράνε ως λευκά. Καμία άλλη logic αλλαγή — αν το PNG φορτώσει, η `mat.color` γίνεται `#ffffff` και πέφτει το tint.

## Αρχεία προς αλλαγή

- `tools/l2-extract-npc-textures.mjs` — σωστή σειρά, Shader-chain follower, επεκταμένο import parsing, levenshtein diagnostics.
- `src/lib/npc-mesh.ts` — fallback χρώμα beige → γκρι (1 γραμμή).

## Πώς ξανατρέχει το extractor

Επανατρέχω με:
```bash
node tools/l2-extract-npc-textures.mjs --all
```

Το tool κάνει skip ό,τι PNG υπάρχει ήδη (γρ. 103), οπότε για να ξανα-δοκιμάσει τα missing πρέπει είτε να σβήσουμε τα missing markers (δεν υπάρχουν — απλά δεν γράφονται PNGs), οπότε ξανα-rescan όλα τα `tex` set και θα προσπαθήσει ξανά τα missing. Το output μετράει `decoded X / missing Y` — το `Y` πρέπει να πέσει σημαντικά.

## Out of scope

- Live in-browser UTX texture decode (το `src/lib/l2-protocol/texture-fallback.ts` που υπάρχει είναι skeleton για μελλοντική live αποκωδικοποίηση — δεν συνδέεται σε αυτό το loop, δεν αλλάζει συμπεριφορά runtime).
- Character/armor textures (`l2-extract-character-textures.mjs`) — αν θες την ίδια διόρθωση και εκεί, σε επόμενο loop (παρόμοιο patch, διαφορετικό αρχείο).
- Specular/normal/shadow extraction — παραμένουν φιλτραρισμένα.

## Έλεγχος

- Re-run extractor → νέο count: το `missing` πρέπει να μειωθεί.
- Visual στο preview: NPCs που ήταν λευκά → εμφανίζουν texture. Όσα ακόμη λείπουν → γκρι (όχι λευκό).
- Console (Node) πρέπει να εμφανίσει `[tex-miss]` lines με κοντινά exports για να ξέρουμε ποια ονόματα να επεξεργαστούμε χειροκίνητα.
