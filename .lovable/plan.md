## Στόχος

1. **Πραγματικό login** στον `l2server.slave.gr` (όχι mock) — auth + server list + character list.
2. **Files/Settings UI πριν το login** (CDN mount, local folder mount, cache status).

---

## Τι θα δουλέψει & τι όχι (να ξεκαθαριστεί)

**Τεχνικά εμπόδια:**
- Ο browser **δεν μπορεί** να ανοίξει raw TCP στο `l2server.slave.gr:2106`. Πρέπει να γίνει **WebSocket ↔ TCP bridge** στο backend μας.
- Το backend τρέχει σε **Cloudflare Workers**. Έχει `connect()` από `cloudflare:sockets` που υποστηρίζει arbitrary TCP outbound — άρα bridge είναι εφικτό.
- Το L2 login protocol είναι binary με **RSA-1024 (modified) + Blowfish-ECB + 2-byte LE length prefix + 8-byte checksum**. Διαφέρει σημαντικά ανά chronicle.
- Δεν ξέρουμε σίγουρα το chronicle. Θα κάνουμε **auto-detect** από το `Init` packet (στέλνει protocol revision: 419/660/746/...).
- Το «character list από game server» απαιτεί **δεύτερο bridge** σε άλλο host:port (παίρνουμε από `ServerList`) και ξανά crypto handshake. Διπλάσιος όγκος δουλειάς.

**Honest expectation:** η ολοκληρωμένη υλοποίηση είναι **πολλές εκατοντάδες γραμμές crypto + packet parsing**. Θα πάρει χρόνο και πιθανότατα **iterations με δοκιμές κατά του πραγματικού server**, γιατί κάθε private server έχει μικρο-διαφοροποιήσεις (custom opcodes, NetPro filters, GameGuard, κ.λπ.). Αν ο slave.gr έχει **GameGuard/NPS/anti-bot**, το login θα μπλοκάρεται από browser ανεξάρτητα τι κάνουμε.

---

## Plan

### Step 1 — UI reorder (γρήγορο, ασφαλές)

Αναδιάταξη του `src/routes/index.tsx`:
- Πάνω: τίτλος + **Asset Status panel** (CDN mount state, local folder mount, cache size, "Mount folder" / "Open file manager" buttons) — αντλεί από `local-mount.ts` + `cdn-manifest.ts`
- Κάτω: το login form (όπως είναι, αλλά συνδεδεμένο με το νέο flow του Step 2)
- Δείχνει επίσης auth server (`l2server.slave.gr:2106`) που διαβάζεται από `l2-config.ts` (`loadL2Ini` + `summarize`)
- Επιδιόρθωση του LastPass hydration mismatch με `suppressHydrationWarning` στο form wrapper

### Step 2 — WebSocket↔TCP bridge (Cloudflare Worker)

Νέο server route: **`src/routes/api/l2-bridge.ts`** (WebSocket endpoint).

```text
Browser ──WS──> /api/l2-bridge?host=l2server.slave.gr&port=2106
                       │
                       ├─ accept WebSocket
                       ├─ import { connect } from "cloudflare:sockets"
                       ├─ socket = connect({hostname, port})
                       ├─ pipe WS frames ⇄ TCP socket (binary)
                       └─ close on either side
```

- Allowlist hosts (μόνο `l2server.slave.gr` + ports από ini για να μη γίνει open proxy)
- Binary frames και στις δύο κατευθύνσεις
- Heartbeat ping/pong

### Step 3 — L2 login protocol (client-side, στο browser)

Νέο module **`src/lib/l2-protocol/`**:

```text
src/lib/l2-protocol/
├── blowfish.ts        # Blowfish-ECB (port από L2J reference, ~300 lines)
├── rsa.ts             # RSA-1024 modified (Web Crypto + manual padding)
├── checksum.ts        # XOR checksum για packets
├── packets.ts         # Packet writer/reader (LE, strings UCS-2)
├── login-client.ts    # State machine: Init → AuthGameGuard → RequestAuthLogin → LoginOk → RequestServerList → ServerList
└── opcodes.ts         # Chronicle-specific opcode tables (Classic / Interlude / GoD)
```

**Flow:**
1. WS open → server στέλνει `Init` packet (opcode 0x00): περιέχει RSA public key (128 bytes) + Blowfish key (16 bytes) + protocol revision
2. Auto-detect chronicle από revision
3. (Αν χρειάζεται) `AuthGameGuard` reply με 0x00 (no GG)
4. `RequestAuthLogin`: encrypt username+password με RSA → στείλε με Blowfish encryption
5. Λάβε `LoginOk` (session keys) ή `LoginFail` (account/password wrong, ban, κ.λπ.)
6. `RequestServerList` → λάβε λίστα servers με IPs/ports
7. Update UI: δείξε πραγματικούς servers αντί για mock

### Step 4 — Game server connection (για character list)

Δεύτερος WS bridge στον game server IP (από ServerList). Νέο μικρότερο protocol module για το game side (διαφορετικά opcodes, διαφορετική crypto rotation). 

**Risk:** εδώ είναι το πιο πιθανό σημείο αποτυχίας — πολλοί servers έχουν προστασίες (IP geofence, client signature, hwid check). Αν χτυπήσει wall, θα σταματήσουμε στο ServerList και θα ενημερώσουμε.

### Step 5 — UI integration

- Πραγματικός servers list (από Step 3)
- Real error messages (Account does not exist, Wrong password, Server is full, κ.λπ.)
- Character list page (`/characters.tsx` — υπάρχει ήδη ως stub) γεμίζει από Step 4

---

## Technical notes (για reference)

- **L2J reference implementation** για το login crypto: github.com/L2J/L2J_Login (πηγή για τα packet formats και RSA padding)
- **Cloudflare Workers TCP**: `connect()` λειτουργεί από Workers Free, αλλά με rate limits. Outbound σε port 2106 επιτρέπεται.
- **Hydration mismatch** (από LastPass extension στα inputs): λύνεται με `suppressHydrationWarning` στο `<form>` — δεν προκαλείται από εμάς.
- **Chronicle detection**: protocol revisions — 419=C4, 660=Interlude, 746=Gracia, 152/267=Classic, >=27x=Salvation+. Θα log-άρουμε ότι βρούμε και θα προσαρμόσουμε opcode table.

---

## Παραδοτέα ανά step

| Step | Files | Risk |
|------|-------|------|
| 1 | `src/routes/index.tsx` | low |
| 2 | `src/routes/api/l2-bridge.ts` | medium (Worker TCP quotas) |
| 3 | `src/lib/l2-protocol/*` (6 files) | high (crypto correctness) |
| 4 | `src/lib/l2-protocol/game-client.ts` + game bridge | very high (server-specific) |
| 5 | `src/routes/index.tsx`, `src/routes/characters.tsx` | low |

**Πρόταση:** ας κάνουμε **Steps 1+2+3 σε αυτή τη φάση** ώστε να έχουμε real auth + real server list. Το Step 4 (char list) το αφήνουμε για επόμενο γύρο αφού επιβεβαιώσουμε ότι το auth δουλεύει κατά του slave.gr. Αν συμφωνείς, κάνε approve και ξεκινάω.