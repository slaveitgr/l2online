## Τι ανακάλυψα από το Mobius/Superion source

Όλη η διαφορά με τον τρέχοντα κώδικα είναι ότι στο L2J Mobius **όλα τα πακέτα είναι Blowfish-encrypted από το πρώτο byte** — ακόμα και το Init:

- **Init (server → client)**: Blowfish-ECB με **static key** `6b 60 cb 5b 82 ce 90 b1 cc 2b 6c 55 6c 6c 6c 6c` + επιπλέον **XOR pass** (`NewCrypt.encXORPass`) μέσα στο payload.
- **Μετά το Init**: Blowfish-ECB με τον **session key** (16 bytes που έρχονται μέσα στο Init).

Γι' αυτό το πρώτο byte φαινόταν 0x21 (encrypted garbage) και η "revision" 0xA5C0BFFC αντί 0xC621.

## Opcode map (από `LoginClientPackets.java` + `LoginServerPackets.java`)

| Dir | Op | Packet |
|---|---|---|
| C→S | 0x07 | AuthGameGuard |
| C→S | 0x00 | RequestAuthLogin |
| C→S | 0x05 | RequestServerList |
| C→S | 0x02 | RequestServerLogin |
| C→S | 0x0E/0x0F | PI Agreement (Korean compliance — αν χρειαστεί) |
| S→C | 0x00 | Init |
| S→C | 0x0B | GGAuth |
| S→C | 0x03 | LoginOk |
| S→C | 0x04 | ServerList |
| S→C | 0x01 | LoginFail |
| S→C | 0x06 | PlayFail |
| S→C | 0x0D | LoginOptFail |
| S→C | 0x11/0x12 | PIAgreementCheck/Ack |

## Init structure (από `Init.java`)

```
u8  opcode = 0x00
u32 sessionId
u32 protocolRevision = 0x0000C621
b   scrambledRsaModulus (128 bytes)
u32 ggKey[4]   (16 bytes total)        ← εδώ είχα skip 16 αντί για **32**
u8  blowfishKey[16]                    ← σωστή θέση
u8  null terminator
```

## Credential block (από `RequestAuthLogin.java`)

Legacy 128-byte block (server δέχεται και νέο 256-byte, αλλά ξεκινάμε με legacy):
- username @ offset **0x5E**, length 14
- password @ offset **0x6C**, length 16

## RSA scramble (από `ScrambledKeyPair.java`)

Ο τρέχων `unscrambleModulus` έχει λάθος βήματα. Το σωστό inverse:
1. `m[0x40+i] ^= m[i]` for i in 0..0x40
2. `m[0x0d+i] ^= m[0x34+i]` for i in 0..4
3. `m[i] ^= m[0x40+i]` for i in 0..0x40
4. swap `m[0x00..0x04]` ↔ `m[0x4d..0x51]`

## Encryption flow (από `LoginEncryption.java` + `NewCrypt.java`)

- **Server → Client (Init)**: `appendChecksum + encXORPass + Blowfish(static)` → client undoes με `Blowfish.decrypt + verifyChecksum + decXORPass`
- **Όλα τα επόμενα**: `appendChecksum + Blowfish(sessionKey)` (καμία XOR pass) → ακριβώς ό,τι κάνει ήδη ο `sendFrame()`

## Αλλαγές στον κώδικα

| File | Αλλαγή |
|---|---|
| `src/lib/l2-protocol/packets.ts` | + `encXORPass(buf, offset, size, key)` (self-inverse· ίδιο για enc/dec· ταυτόσημο με NewCrypt.java) |
| `src/lib/l2-protocol/rsa.ts` | Rewrite `unscrambleModulus` σωστά. `packAuthLoginBlock(user,pass)` τοποθετεί user@0x5E len 14 ASCII και pass@0x6C len 16 ASCII μέσα σε 128 zeros |
| `src/lib/l2-protocol/login-client.ts` | (α) Init decrypt με static Blowfish, verify checksum, undo XOR pass. (β) Init parse: skip 32 (όχι 16). (γ) Hex dump του Init στο protocol log για debugging. (δ) Mobius opcodes ως πάνω πίνακας. (ε) Χειρισμός 0x11 (PIAgreementCheck) — αν φτάσει, στέλνουμε 0x0F (RequestPIAgreement) με agreement=1, μετά συνεχίζουμε. (στ) Καθαρότερο error message όταν `verifyChecksum` αποτύχει |

UI/index.tsx δεν αλλάζει — μόνο το log γεμίζει με τις νέες status lines.

## Verification

Μετά το deploy το protocol log πρέπει να δείχνει:

```
TCP connected l2server.slave.gr:2106
← init enc 192B
← init dec 186B opcode=0x00 rev=0xc621 session=0x....
Sending AuthGameGuard
← opcode 0x0b (GGAuth)
Sending RequestAuthLogin
← opcode 0x03 (LoginOk)  ή  0x01 (LoginFail, reason=...)
Sending RequestServerList
← opcode 0x04 (ServerList) — N servers
```

Αν εμφανιστεί 0x11 (PIAgreementCheck), o handler θα στείλει αυτόματα 0x0F και θα συνεχίσει.
