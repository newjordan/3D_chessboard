# Decentralized Signed Match Arbiter — Design Spec

**Date:** 2026-04-14  
**Status:** Approved  

---

## Overview

Introduces a secured, community-hosted match arbitration infrastructure. Trusted external **Arbiters** can fetch and execute match bouts, with code integrity guaranteed by Ed25519 signatures and Arbiter identity managed through server-generated keypairs tied to existing user accounts.

---

## 1. Database Schema

### New model: `RunnerKey` (Note: Schema model remains 'RunnerKey' for consistency)

Tied to an existing `User`. Fields:

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` (uuid) | PK |
| `userId` | `String` | FK → User |
| `label` | `String?` | Optional display name |
| `publicKey` | `String` | PEM format, used to verify Arbiter requests |
| `privateKey` | `String` | PEM format, shown to Arbiter once at creation |
| `trusted` | `Boolean` | Default `false`. Must be set by admin before Arbiter can fetch bouts |
| `jobsProcessed` | `Int` | Default 0. Bouts resolved count |
| `createdAt` | `DateTime` | |
| `revokedAt` | `DateTime?` | Nullable. Soft delete — revoked keys are rejected |

`User` model gains a `runnerKeys RunnerKey[]` relation (Arbiter identities).

### New model: `ServerKey`

Singleton. Holds the server's own signing keypair for bounty payload integrity.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` (uuid) | PK |
| `publicKey` | `String` | PEM format. Exposed publicly via `GET /api/public-key` |
| `privateKey` | `String` | PEM format. Never exposed externally |
| `createdAt` | `DateTime` | |

---

## 2. Crypto Utilities (`crypto.ts`)

A single file placed at `apps/api/src/crypto.ts` and `apps/worker/src/crypto.ts` (identical, intentionally duplicated — no shared package infrastructure exists).

Uses **Node.js built-in `crypto` module only** (no new dependencies). All functions:

```ts
generateKeyPair(): { publicKey: string; privateKey: string }
// Ed25519 keypair in PEM format

hashData(data: string): string
// SHA-256 hex digest

signData(data: string, privateKeyPem: string): string
// Ed25519 signature, returned as base64

verifyData(data: string, signatureBase64: string, publicKeyPem: string): boolean
// Returns true if signature is valid for data under publicKey
```

Data passed to `signData`/`verifyData` is always a deterministic string. For job payloads: `matchId + challengerHash + defenderHash` (concatenated, no separator ambiguity since UUIDs and hex hashes have fixed formats).

---

## 3. API Changes (`apps/api/src/index.ts`)

### 3.1 Startup

On boot:
1. Query `ServerKey` table.
2. If empty, call `generateKeyPair()`, insert a new `ServerKey` row.
3. Cache `{ publicKey, privateKey }` in memory for the process lifetime.

### 3.2 Public Endpoint

```
GET /api/public-key
```
Returns `{ publicKey: string }` — the server's Ed25519 public key in PEM format. No auth required. Used by Arbiters to bootstrap signature verification.

### 3.3 Arbiter Key Endpoints (admin-gated via `x-user-id` + role check)

```
POST /api/admin/runners
```
Body: `{ userId: string, label?: string }`  
- Generates a new Ed25519 keypair.  
- Stores both keys in a new `RunnerKey` row with `trusted: false`.  
- Returns the full record **including `privateKey`** — this is the **only time** it is returned. Response includes a `privateKeyShownOnce: true` flag to signal the frontend.

```
GET /api/admin/runners
```
Returns all `RunnerKey` rows joined with `User` (username, email). Excludes `privateKey` from response.

```
PATCH /api/admin/runners/:id/trust
```
Body: `{ trusted: boolean }`  
Toggles the `trusted` flag.

```
DELETE /api/admin/runners/:id
```
Sets `revokedAt = now()`. Soft delete — key is permanently rejected from this point.

### 3.4 Updated `POST /api/broker/next-jobs`

**Two authentication paths:**

**Path A — `x-broker-secret` (existing, unchanged)**  
- Same behavior as today.  
- Batch cap: `Math.min(10, count)`.  
- Access: placement + rating matches.

**Path B — Trusted Arbiter (new)**  
Required headers:  
- `x-worker-public-key`: Arbiter's public key (PEM)  
- `x-worker-signature`: Ed25519 signature of the raw request body string, signed with Arbiter's private key  

Validation steps:
1. Look up `RunnerKey` by `publicKey`.
2. Check `trusted === true` and `revokedAt === null`.
3. Verify `x-worker-signature` against the request body using `verifyData`.
4. If all pass, grant access.

Batch cap for trusted Arbiters: `Math.min(100, count)`.  
Access: **`rating` matches only** (placement matches remain gated behind Path A).

**Job payload additions (both paths):**

```ts
{
  jobId, matchId, matchType, timeControl, gamesPlanned,
  challenger: { id, name, language, code },
  defender: { id, name, language, code },
  // NEW:
  challengerHash: string,   // SHA-256 of challenger code
  defenderHash: string,     // SHA-256 of defender code
  serverSignature: string,  // sign(matchId + challengerHash + defenderHash)
}
```

### 3.5 Updated `POST /api/broker/submit`

Same dual-auth as `next-jobs`. For trusted Arbiter submissions:
1. Verify `x-worker-signature` on request body.
2. On success, increment `RunnerKey.jobsProcessed`.
3. Store Arbiter's public key in `Match.processedBy` for attribution.

---

## 4. Worker Changes (`apps/worker/src/index.ts`)

**Startup addition:**
- Fetch server public key from `GET /api/public-key` once at startup. Cache in memory.

**Before executing any `match_run` job (when job includes signature fields):**

```
1. Recompute challengerHash = hashData(challengerCode)
2. Recompute defenderHash = hashData(defenderCode)
3. Verify challengerHash === job.challengerHash
4. Verify defenderHash === job.defenderHash
5. Verify serverSignature = verifyData(
     matchId + challengerHash + defenderHash,
     job.serverSignature,
     serverPublicKey
   )
```

If any check fails:
- Log the tamper attempt with full details.
- Mark job as `failed` with error: `"Integrity check failed: boutique payload may have been tampered"`.
- Do not execute the engine code.

If all checks pass, proceed to `arbitrate` as normal.

---

## 5. Web `/arbiter` Page (`apps/web/src/app/arbiter/page.tsx`)

### Visual Style

Matrix/terminal aesthetic: dark background (`#0a0a0a`), green monospace text (`#00ff41`), subtle scanline CSS overlay, glowing borders on cards. Follows the existing site's component patterns.

### Public Section (all visitors)

**Hero**  
Tagline + short explanation: what community Arbiters are, why they matter (decentralize compute, earn trust, power the arena).

**Quickstart**  
Copy-pasteable Docker command:
```
docker run \
  -e API_URL=https://api.chessagents.dev \
  -e PUBLIC_KEY="<your-public-key>" \
  -e PRIVATE_KEY="<your-private-key>" \
  jaymaart/chess-worker --mode public
```

**How It Works**  
Step-by-step with inline ASCII flow diagram:
```
[Arbiter] → POST /api/broker/next-jobs (signed)
          ← Job payload + serverSignature
[Arbiter] → Verify serverSignature ✓
          → Verify code hashes ✓
          → Arbitrate bout
          → POST /api/broker/submit (signed)
[Server]  → Verify Arbiter signature ✓
          → Record result + attribute to Arbiter
```

**Requirements & Limits**
- Account required (for key issuance)
- Must be approved as trusted by admin
- Max 100 bouts per batch request
- Supported languages: JavaScript, Python
- Time control: standard arena settings

**FAQ**
- *Do I need an account?* Yes — your Arbiter key is tied to your account.
- *How do I get a key?* Sign up, then visit #become-an-arbiter to get issued a key.
- *What hardware do I need?* Any machine that can run Docker and execute JS/Python.
- *What if I submit a bad result?* Results are validated server-side. Repeated bad submissions can lead to key revocation.
- *Is my private key safe?* The private key is shown once at issuance and stored server-side. Treat it like a password — if compromised, contact an admin to revoke and re-issue.
- *What bouts will I resolve?* Rating matches only. Placement bouts are reserved for trusted internal Arbiters.
- *Will there be a leaderboard?* Arbiter stats (bouts resolved) are tracked and displayed on this page.

**CTA**  
"Get your Arbiter key" → links to sign-in if unauthenticated, or scrolls to dashboard if authenticated.

### Authenticated Arbiter Dashboard (signed-in users with a RunnerKey)

Shown only when: user is signed in AND has at least one `RunnerKey`.

**Key status card:**
- Public key (truncated with copy button for full value)
- Trusted badge (green "Trusted" or amber "Pending Approval")
- Bouts resolved count
- Created date
- Revoked status (if applicable)

**No key yet:**  
Message: "You don't have an Arbiter key yet. Visit #become-an-arbiter to get registered."

**Pending trust:**  
Message: "Your key is pending admin approval. Once approved, you can start hosting bouts."

---

## 6. Admin Panel — Arbiters Tab

New page: `apps/web/src/app/admin/runners/page.tsx`  
Added to the existing admin nav alongside Engines, Users, Matches, Jobs.

### Table View

Columns: User (linked to profile), Label, Public Key (first 20 chars + `...`), Trusted (badge), Bouts Resolved, Created, Status (Active / Revoked), Actions.

### Actions

- **Toggle Trust** — `PATCH /api/admin/runners/:id/trust`. Flips trusted boolean.
- **Revoke** — `DELETE /api/admin/runners/:id`. Confirmation prompt before firing.

### Create Arbiter Key

Form at top of page:
- User selector (dropdown of existing users)
- Label (optional text input)
- Submit button: "Generate Key"

On success: **one-time modal** displaying the private key with:
- Full private key in a monospace box
- Copy button
- Bold warning: *"This is the only time this private key will be shown. Store it securely before closing."*
- "I've copied my key" confirmation checkbox required before the modal can be dismissed.
- Secondary confirmation prompt if user tries to close without checking the box.

---

## Security Properties

| Threat | Mitigation |
|--------|-----------|
| Malicious job injection | Server signs every payload; Arbiter verifies before executing |
| Code swap MITM | Arbiter re-hashes code and compares against signed hashes |
| Key impersonation | Arbiter must sign every request with stored private key |
| Untrusted Arbiters | `trusted` flag must be set by admin before key grants access |
| Compromised key | Admin can soft-revoke instantly; all future requests rejected |
| Placement match exposure | Placement bouts never served to trusted Arbiter path |

---

## Open Questions (Resolved)

| Question | Decision |
|----------|----------|
| Shared package for crypto? | Duplicate `crypto.ts` in both apps — no shared package needed |
| Match tier access? | Trusted Arbiters: rating matches only. Placement: gated behind broker secret |
| Arbiter key ownership? | Server generates + stores both keys. Arbiter receives private key once |
| Arbiter registration? | Keys tied to existing user accounts. Admin issues keys and sets trusted flag |
| Batch cap? | Trusted Arbiters: 100. Secret-gated path: 10 |
| Admin UI placement? | New `/admin/arbiters` tab in existing admin panel |
