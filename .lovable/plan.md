## Πρόβλημα

Το `/api/l2-bridge` τρέχει αλλά πέφτει με 500:

```
Raw TCP not available in this runtime:
Code generation from strings disallowed for this context
```

Το προηγούμενο fix χρησιμοποίησε `new Function("s","return import(s)")` για να κρύψει το `cloudflare:sockets` από τον Rollup analyzer. Όμως το Cloudflare workerd μπλοκάρει `eval`/`new Function` για λόγους ασφαλείας, οπότε το dynamic import δεν εκτελείται ποτέ → ο WebSocket κλείνει με error στον client.

## Λύση

Δύο μικρές αλλαγές, καμία αλλαγή στο UI ή το πρωτόκολλο.

### 1) `src/routes/api/l2-bridge.ts` — runtime specifier + `@vite-ignore`

Αντικατάσταση του `new Function(...)` με κανονικό dynamic import, όπου το specifier χτίζεται runtime (δεν φαίνεται σαν literal στον Rollup) και προσθέτουμε `/* @vite-ignore */` για να μη βγάλει warning ο Vite:

```ts
const spec = "cloudflare:" + "sockets"; // hide from static analysis
const mod = await import(/* @vite-ignore */ spec);
connect = mod.connect;
```

Αυτό εκτελείται κανονικά στο workerd (δεν είναι eval), και δεν θεωρείται από τον bundler ως resolvable specifier.

### 2) `vite.config.ts` — externalize `cloudflare:sockets`

Για να μην εσκαλάρει ο `@vitejs/plugin-react` το rollup warning "unresolved import treated as external" σε build failure, το δηλώνουμε ρητά external. Το μήνυμα του ίδιου του Vite προτείνει αυτή τη λύση:

```ts
export default defineConfig({
  tanstackStart: { server: { entry: "server" } },
  vite: {
    build: {
      rollupOptions: {
        external: ["cloudflare:sockets"],
      },
    },
  },
});
```

Σημείωση: δεν αγγίζουμε `ssr.external` ή `resolve.external` (απαγορεύεται από το template). Το `build.rollupOptions.external` είναι ασφαλές γιατί το `cloudflare:` είναι protocol που τον σερβίρει το ίδιο το workerd runtime — δεν χρειάζεται bundling.

## Verification

Μετά το deploy:

```
curl -i --http1.1 \
  -H "Upgrade: websocket" -H "Connection: Upgrade" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  "https://l2online.lovable.app/api/l2-bridge?host=l2server.slave.gr&port=2106"
```

Αναμενόμενο: **HTTP/1.1 101 Switching Protocols** (όχι 500). Από το UI: το log θα δείξει `connected → init → ...` αντί για `WebSocket error`.

## Αρχεία

| File | Change |
|---|---|
| `src/routes/api/l2-bridge.ts` | Αντικατάσταση `new Function` με runtime-built specifier + `/* @vite-ignore */` |
| `vite.config.ts` | Προσθήκη `vite.build.rollupOptions.external: ["cloudflare:sockets"]` |
