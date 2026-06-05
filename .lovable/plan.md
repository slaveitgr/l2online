# SSO Auto-Login από L2 Slave Launcher

Όταν ο launcher ανοίγει το web client με `?sso=<token>`, ανταλλάσσουμε το token με session μέσω του `l2.slave.gr` και μπαίνουμε κατευθείαν στο game χωρίς να φανεί καθόλου login screen.

## Flow

```
URL ?sso=TOKEN
   │
   ▼
POST https://l2.slave.gr/api/public/launcher/sso-verify  { token }
   │
   ├── ok:true → store session, strip ?sso=, auto-connect → /characters
   │
   └── fail   → fallback login screen + μήνυμα "SSO session expired, login manually"
```

## Αλλαγές αρχείων

### 1. `src/lib/l2-protocol/sso.ts` (νέο)
Μικρό helper module:
- `readSsoTokenFromUrl()` — διαβάζει `?sso=` από `window.location.search` (client-only).
- `stripSsoFromUrl()` — `history.replaceState({}, '', window.location.pathname)`.
- `verifySsoToken(token)` — `fetch("https://l2.slave.gr/api/public/launcher/sso-verify", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ token }) })`. Returns typed result `{ ok:true, login, sessionToken, expiresAt } | { ok:false, reason }`.
- `saveSsoSession({ login, sessionToken, expiresAt })` — γράφει σε `localStorage` με key `l2.session` (JSON: `{ login, sessionToken, expiresAt }`).
- `loadSsoSession()` / `clearSsoSession()` — helpers με expiry check.

### 2. `src/routes/index.tsx`
Top-level effect στον `Launcher` πριν render-αριστεί το login UI:

- Νέο state `ssoPhase: "checking" | "ready" | "failed"`. Default `"checking"` **μόνο** όταν υπάρχει `?sso=` στο URL ή έγκυρο `l2.session` στο localStorage· αλλιώς `"ready"` ώστε να δείχνει αμέσως το login.
- `useEffect` τρέχει μία φορά:
  1. Αν υπάρχει `?sso=TOKEN`:
     - `stripSsoFromUrl()` αμέσως (single-use, να μη μείνει σε history/refresh).
     - `await verifySsoToken(token)`.
     - On success → `saveSsoSession(...)` και κάλεσε `doLogin(login, sessionToken)` (το token παίζει ρόλο password προς τον L2 login server, όπως επιβεβαιώθηκε).
     - On failure → `setError("SSO session expired, login manually.")`, `setSsoPhase("failed")`.
  2. Αν δεν υπάρχει `?sso=` αλλά υπάρχει valid `l2.session` (όχι expired) → `doLogin(login, sessionToken)` αυτόματα. Αν expired → `clearSsoSession()`, fallback σε login.
- Render guard:
  - `ssoPhase === "checking"` → render `<L2LauncherShell>` με μόνο ένα διακριτικό "Signing in…" overlay (όχι login inputs, όχι server-select). Έτσι δεν αναβοσβήνει το login screen.
  - μετά την επιτυχία, ο υπάρχων `doLogin` flow οδηγεί σε `phase === "server-select"`· για να μη χρειαστεί click, αν είχαμε μπει από SSO ή stored session και έρθουν servers, **auto-select τον πρώτο και κάλεσε `onEnterWorld()`** μία φορά (flag `autoEnterRef`). Το navigate στο `/characters` γίνεται ήδη από το υπάρχον `onEnterWorld`.

### 3. SSR-safety
Όλα τα `window` / `localStorage` accesses τυλίγονται σε `typeof window !== "undefined"` και τρέχουν μέσα σε `useEffect`, ώστε το SSR HTML να ταιριάζει με το initial client render (αρχικό state ίδιο σε server και client). Αυτό αποφεύγει νέο hydration mismatch.

### 4. Logout / cleanup
Όταν ο χρήστης κάνει "Cancel" στο server-select ή αποτύχει το login με stored session, καλούμε `clearSsoSession()` ώστε να μη μπει σε loop auto-login.

## Τι **δεν** αλλάζει
- `L2LoginClient`, `game-client.ts`, χαρακτήρες route, HUD: παραμένουν ως έχουν. Το sessionToken απλώς χρησιμοποιείται ως password στο υπάρχον TCP login flow.
- Δεν προστίθεται backend/edge function στο project — το `/sso-verify` υπάρχει ήδη στο `l2.slave.gr`.

## Technical notes
- Key: `l2.session` (όπως ζητήθηκε), JSON-encoded.
- Expiry: αν `expiresAt` (ISO ή epoch ms) ≤ `Date.now()`, treat as missing.
- Network errors στο `verifySsoToken` → ίδιος fallback όπως 401/expired.
- CORS: το endpoint πρέπει να επιτρέπει το origin του preview/published site· αν δεν επιτρέπει, θα φανεί σαν network error → fallback login (καμία επιπλέον αλλαγή client-side).
