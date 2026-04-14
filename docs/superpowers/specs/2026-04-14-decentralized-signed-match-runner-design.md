# Decentralized Signed Match Runner — Design Spec

**Date:** 2026-04-14  
**Status:** Approved  

---

## Overview

Introduces a secured, community-run match execution infrastructure. Trusted external runners can fetch and execute match jobs, with code integrity guaranteed by Ed25519 signatures and runner identity managed through server-generated keypairs tied to existing user accounts.

---

## 1. Database Schema

### New model: `RunnerKey`

Tied to an existing `User`. Fields:

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` (uuid) | PK |
| `userId` | `String` | FK → User |
| `label` | `String?` | Optional display name |
| `publicKey` | `String` | PEM format, used to verify runner requests |
| `privateKey` | `String` | PEM format, shown to runner once at creation |
| `trusted` | `Boolean` | Default `false`. Must be set by admin before runner can fetch jobs |
| `jobsProcessed` | `Int` | Default 0. Incremented on each successful result submission |
| `createdAt` | `DateTime` | |
| `revokedAt` | `DateTime?` | Nullable. Soft delete — revoked keys are rejected |

`User` model gains a `runnerKeys RunnerKey[]` relation.

### New model: `ServerKey`

Singleton. Holds the server's own signing keypair for job payload integrity.

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
Returns `{ publicKey: string }` — the server's Ed25519 public key in PEM format. No auth required. Used by runners to bootstrap signature verification.

### 3.3 Runner Key Endpoints (admin-gated via `x-user-id` + role check)

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

**Path B — Trusted runner (new)**  
Required headers:  
- `x-worker-public-key`: runner's public key (PEM)  
- `x-worker-signature`: Ed25519 signature of the raw request body string, signed with runner's private key  

Validation steps:
1. Look up `RunnerKey` by `publicKey`.
2. Check `trusted === true` and `revokedAt === null`.
3. Verify `x-worker-signature` against the request body using `verifyData`.
4. If all pass, grant access.

Batch cap for trusted runners: `Math.min(100, count)`.  
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

Same dual-auth as `next-jobs`. For trusted runner submissions:
1. Verify `x-worker-signature` on request body.
2. On success, increment `RunnerKey.jobsProcessed`.
3. Store runner's public key in `Match.processedBy` for attribution.

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
- Mark job as `failed` with error: `"Integrity check failed: job payload may have been tampered"`.
- Do not execute the engine code.

If all checks pass, proceed to `runMatch` as normal.

---

## 5. Web `/run` Page (`apps/web/src/app/run/page.tsx`)

### Visual Style

Matrix/terminal aesthetic: dark background (`#0a0a0a`), green monospace text (`#00ff41`), subtle scanline CSS overlay, glowing borders on cards. Follows the existing site's component patterns.

### Public Section (all visitors)

**Hero**  
Tagline + short explanation: what community runners are, why they matter (decentralize compute, earn trust, power the arena).

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
[Runner] → POST /api/broker/next-jobs (signed)
         ← Job payload + serverSignature
[Runner] → Verify serverSignature ✓
         → Verify code hashes ✓
         → Run match
         → POST /api/broker/submit (signed)
[Server] → Verify worker signature ✓
         → Record result + attribute to runner
```

**Requirements & Limits**
- Account required (for key issuance)
- Must be approved as trusted by admin
- Max 100 jobs per batch request
- Supported languages: JavaScript, Python
- Time control: standard arena settings

**FAQ**
- *Do I need an account?* Yes — your runner key is tied to your account.
- *How do I get a key?* Sign up, then contact an admin to get issued a key.
- *What hardware do I need?* Any machine that can run Docker and execute JS/Python.
- *What if I submit a bad result?* Results are validated server-side. Repeated bad submissions can lead to key revocation.
- *Is my private key safe?* The private key is shown once at issuance and stored server-side. Treat it like a password — if compromised, contact an admin to revoke and re-issue.
- *What matches will I run?* Rating matches only. Placement matches are reserved for trusted internal runners.
- *Will there be a leaderboard?* Runner stats (jobs processed) are tracked and displayed on this page.

**CTA**  
"Get your runner key" → links to sign-in if unauthenticated, or scrolls to dashboard if authenticated.

### Authenticated Runner Dashboard (signed-in users with a RunnerKey)

Shown only when: user is signed in AND has at least one `RunnerKey`.

**Key status card:**
- Public key (truncated with copy button for full value)
- Trusted badge (green "Trusted" or amber "Pending Approval")
- Jobs processed count
- Created date
- Revoked status (if applicable)

**No key yet:**  
Message: "You don't have a runner key yet. Contact an admin to get registered."

**Pending trust:**  
Message: "Your key is pending admin approval. Once approved, you can start fetching jobs."

---

## 6. Admin Panel — Runners Tab

New page: `apps/web/src/app/admin/runners/page.tsx`  
Added to the existing admin nav alongside Engines, Users, Matches, Jobs.

### Table View

Columns: User (linked to profile), Label, Public Key (first 20 chars + `...`), Trusted (badge), Jobs Processed, Created, Status (Active / Revoked), Actions.

### Actions

- **Toggle Trust** — `PATCH /api/admin/runners/:id/trust`. Flips trusted boolean.
- **Revoke** — `DELETE /api/admin/runners/:id`. Confirmation prompt before firing.

### Create Runner Key

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
| Malicious job injection | Server signs every payload; runner verifies before executing |
| Code swap MITM | Runner re-hashes code and compares against signed hashes |
| Key impersonation | Runner must sign every request with stored private key |
| Untrusted runners | `trusted` flag must be set by admin before key grants access |
| Compromised key | Admin can soft-revoke instantly; all future requests rejected |
| Placement match exposure | Placement jobs never served to trusted runner path |

---

## Open Questions (Resolved)

| Question | Decision |
|----------|----------|
| Shared package for crypto? | Duplicate `crypto.ts` in both apps — no shared package needed |
| Match tier access? | Trusted runners: rating matches only. Placement: gated behind broker secret |
| Runner key ownership? | Server generates + stores both keys. Runner receives private key once |
| Runner registration? | Keys tied to existing user accounts. Admin issues keys and sets trusted flag |
| Batch cap? | Trusted runners: 100. Secret-gated path: 10 |
| Admin UI placement? | New `/admin/runners` tab in existing admin panel |
