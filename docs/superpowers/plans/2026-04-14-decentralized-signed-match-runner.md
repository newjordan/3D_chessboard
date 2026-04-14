# Decentralized Signed Match Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cryptographically-signed community runner infrastructure — server-managed Ed25519 keypairs per runner, signed job payloads, code integrity verification, admin runner management, and a `/run` marketing/dashboard page.

**Architecture:** Node built-in `crypto` (Ed25519) handles all signing/verification. API generates a singleton server keypair at startup and signs every job payload. Trusted runners (keyed per user account) sign their broker requests; server verifies before serving jobs. Community runner mode added to `apps/worker` as an alternate polling loop that calls the broker API instead of the DB directly.

**Tech Stack:** Node.js `crypto` (built-in), Express.js, Prisma/PostgreSQL, Next.js (App Router), React, Tailwind, Lucide icons, `sonner` toasts.

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `apps/api/src/crypto.ts` | Ed25519 sign/verify/hash/keygen |
| Create | `apps/worker/src/crypto.ts` | Identical copy — no shared package |
| Create | `apps/worker/src/broker-runner.ts` | Community runner polling loop |
| Modify | `prisma/schema.prisma` | Add `RunnerKey`, `ServerKey` models |
| Modify | `apps/api/src/index.ts` | Startup key init, new endpoints, broker dual-auth |
| Modify | `apps/worker/src/index.ts` | Detect `--mode public`, launch broker runner |
| Create | `apps/web/src/app/run/page.tsx` | Public docs + runner dashboard |
| Create | `apps/web/src/app/admin/runners/page.tsx` | Admin runner key management |
| Modify | `apps/web/src/app/admin/layout.tsx` | Add Runners nav item |
| Modify | `apps/web/src/lib/apiClient.ts` | Add runner API methods |

---

## Task 1: Prisma Schema — Add RunnerKey + ServerKey

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add models to schema**

In `prisma/schema.prisma`, add after the `Job` model and add relation to `User`:

```prisma
// Add to User model (inside the model block, after `submissions Submission[]`):
runnerKeys    RunnerKey[]

// Add these two new models at the bottom of the file:

model RunnerKey {
  id            String    @id @default(uuid())
  userId        String
  label         String?
  publicKey     String    @db.Text
  privateKey    String    @db.Text
  trusted       Boolean   @default(false)
  jobsProcessed Int       @default(0)
  createdAt     DateTime  @default(now())
  revokedAt     DateTime?

  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model ServerKey {
  id         String   @id @default(uuid())
  publicKey  String   @db.Text
  privateKey String   @db.Text
  createdAt  DateTime @default(now())
}
```

- [ ] **Step 2: Run migration**

```bash
cd D:/Github/chess-agents
npx prisma migrate dev --name add_runner_and_server_keys --schema prisma/schema.prisma
```

Expected: migration created and applied, `RunnerKey` and `ServerKey` tables exist.

- [ ] **Step 3: Regenerate Prisma client in api and worker**

```bash
cd D:/Github/chess-agents/apps/api && npm run generate
cd D:/Github/chess-agents/apps/worker && npm run generate
```

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add RunnerKey and ServerKey schema models"
```

---

## Task 2: Crypto Utilities — API

**Files:**
- Create: `apps/api/src/crypto.ts`

- [ ] **Step 1: Create the file**

```typescript
// apps/api/src/crypto.ts
import crypto from "crypto";

export function generateKeyPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKey, privateKey };
}

export function hashData(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function signData(data: string, privateKeyPem: string): string {
  const sig = crypto.sign(null, Buffer.from(data), privateKeyPem);
  return sig.toString("base64");
}

export function verifyData(
  data: string,
  signatureBase64: string,
  publicKeyPem: string
): boolean {
  try {
    return crypto.verify(
      null,
      Buffer.from(data),
      publicKeyPem,
      Buffer.from(signatureBase64, "base64")
    );
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd D:/Github/chess-agents/apps/api
npx ts-node -e "import('./src/crypto').then(c => { const kp = c.generateKeyPair(); const sig = c.signData('hello', kp.privateKey); console.log('verify:', c.verifyData('hello', sig, kp.publicKey)); })"
```

Expected output: `verify: true`

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/crypto.ts
git commit -m "feat: add Ed25519 crypto utilities to api"
```

---

## Task 3: Crypto Utilities — Worker

**Files:**
- Create: `apps/worker/src/crypto.ts`

- [ ] **Step 1: Create identical file**

```typescript
// apps/worker/src/crypto.ts
import crypto from "crypto";

export function generateKeyPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKey, privateKey };
}

export function hashData(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function signData(data: string, privateKeyPem: string): string {
  const sig = crypto.sign(null, Buffer.from(data), privateKeyPem);
  return sig.toString("base64");
}

export function verifyData(
  data: string,
  signatureBase64: string,
  publicKeyPem: string
): boolean {
  try {
    return crypto.verify(
      null,
      Buffer.from(data),
      publicKeyPem,
      Buffer.from(signatureBase64, "base64")
    );
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd D:/Github/chess-agents/apps/worker
npx tsx -e "import('./src/crypto').then(c => { const kp = c.generateKeyPair(); const sig = c.signData('hello', kp.privateKey); console.log('verify:', c.verifyData('hello', sig, kp.publicKey)); })"
```

Expected output: `verify: true`

- [ ] **Step 3: Commit**

```bash
git add apps/worker/src/crypto.ts
git commit -m "feat: add Ed25519 crypto utilities to worker"
```

---

## Task 4: API — Server Key Init + Public Endpoint

**Files:**
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Add import at top of `apps/api/src/index.ts`**

After the existing imports, add:

```typescript
import { generateKeyPair, hashData, signData, verifyData } from "./crypto";
```

- [ ] **Step 2: Add server keypair cache variable**

After `const BUCKET_NAME = ...` line, add:

```typescript
// Server keypair — loaded/generated at startup
let serverPublicKey = "";
let serverPrivateKey = "";
```

- [ ] **Step 3: Add startup function**

Add this function before `app.get("/", ...)`:

```typescript
async function initServerKey() {
  const existing = await prisma.serverKey.findFirst();
  if (existing) {
    serverPublicKey = existing.publicKey;
    serverPrivateKey = existing.privateKey;
    console.log("[Crypto] Server key loaded from DB.");
  } else {
    const kp = generateKeyPair();
    serverPublicKey = kp.publicKey;
    serverPrivateKey = kp.privateKey;
    await prisma.serverKey.create({
      data: { publicKey: kp.publicKey, privateKey: kp.privateKey },
    });
    console.log("[Crypto] New server key generated and stored.");
  }
}
```

- [ ] **Step 4: Call `initServerKey()` at the bottom, before `app.listen`**

Find the `app.listen(...)` call at the bottom of `apps/api/src/index.ts` and wrap it:

```typescript
initServerKey().then(() => {
  app.listen(port, () => {
    console.log(`Chess Agents API running on port ${port}`);
  });
});
```

- [ ] **Step 5: Add public key endpoint**

Add after `app.get("/api/health", ...)`:

```typescript
app.get("/api/public-key", (req, res) => {
  res.json({ publicKey: serverPublicKey });
});
```

- [ ] **Step 6: Verify API starts and key endpoint works**

```bash
cd D:/Github/chess-agents/apps/api
npm run dev
# In another terminal:
curl http://localhost:3001/api/public-key
```

Expected: `{"publicKey":"-----BEGIN PUBLIC KEY-----\n..."}` — a PEM string.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "feat: generate/load server Ed25519 keypair at startup, expose GET /api/public-key"
```

---

## Task 5: API — Runner Key Admin Endpoints

**Files:**
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Add admin runner authorization helper**

Add after the existing `authorizeBroker` middleware:

```typescript
const authorizeAdmin = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const userId = req.headers["x-user-id"] as string;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== "admin") return res.status(403).json({ error: "Forbidden" });
  next();
};
```

(Skip this step if `authorizeAdmin` already exists elsewhere in the file — search first.)

- [ ] **Step 2: Add `POST /api/admin/runners` — create runner key**

Add before the `--- MATCH BROKER API ---` comment block:

```typescript
// --- RUNNER KEY MANAGEMENT ---

app.post("/api/admin/runners", authorizeAdmin, async (req, res) => {
  const { userId, label } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required" });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: "User not found" });

  const kp = generateKeyPair();
  const runnerKey = await prisma.runnerKey.create({
    data: {
      userId,
      label: label || null,
      publicKey: kp.publicKey,
      privateKey: kp.privateKey,
      trusted: false,
    },
  });

  console.log(`[Admin] Runner key created for user ${userId} (key ${runnerKey.id})`);

  res.json({
    ...runnerKey,
    privateKeyShownOnce: true,
  });
});
```

- [ ] **Step 3: Add `GET /api/admin/runners` — list all keys**

```typescript
app.get("/api/admin/runners", authorizeAdmin, async (req, res) => {
  const keys = await prisma.runnerKey.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, username: true, email: true } } },
  });
  // Strip privateKey from list response
  const sanitized = keys.map(({ privateKey, ...rest }) => rest);
  res.json(sanitized);
});
```

- [ ] **Step 4: Add `PATCH /api/admin/runners/:id/trust` — toggle trust**

```typescript
app.patch("/api/admin/runners/:id/trust", authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  const { trusted } = req.body;
  if (typeof trusted !== "boolean") return res.status(400).json({ error: "trusted (boolean) required" });

  const key = await prisma.runnerKey.findUnique({ where: { id } });
  if (!key) return res.status(404).json({ error: "Runner key not found" });

  const updated = await prisma.runnerKey.update({
    where: { id },
    data: { trusted },
  });

  console.log(`[Admin] Runner key ${id} trusted=${trusted}`);
  res.json({ success: true, trusted: updated.trusted });
});
```

- [ ] **Step 5: Add `DELETE /api/admin/runners/:id` — revoke (soft delete)**

```typescript
app.delete("/api/admin/runners/:id", authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  const key = await prisma.runnerKey.findUnique({ where: { id } });
  if (!key) return res.status(404).json({ error: "Runner key not found" });

  await prisma.runnerKey.update({
    where: { id },
    data: { revokedAt: new Date() },
  });

  console.log(`[Admin] Runner key ${id} revoked`);
  res.json({ success: true });
});
```

- [ ] **Step 6: Add `GET /api/runners/me` — current user's runner key (no admin required)**

```typescript
app.get("/api/runners/me", async (req, res) => {
  const userId = req.headers["x-user-id"] as string;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const key = await prisma.runnerKey.findFirst({
    where: { userId, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      label: true,
      publicKey: true,
      trusted: true,
      jobsProcessed: true,
      createdAt: true,
      revokedAt: true,
    },
  });

  res.json(key || null);
});
```

- [ ] **Step 7: Verify endpoints compile and start**

```bash
cd D:/Github/chess-agents/apps/api
npm run dev
```

Expected: API starts with no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "feat: add runner key CRUD endpoints and runner profile endpoint"
```

---

## Task 6: API — Trusted Runner Auth Middleware + Dual-Auth Broker

**Files:**
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Add trusted runner auth middleware**

Add after `authorizeAdmin`:

```typescript
const authorizeTrustedRunner = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const publicKey = req.headers["x-worker-public-key"] as string;
  const signature = req.headers["x-worker-signature"] as string;

  if (!publicKey || !signature) {
    return res.status(401).json({ error: "Missing x-worker-public-key or x-worker-signature" });
  }

  const runnerKey = await prisma.runnerKey.findFirst({
    where: { publicKey, revokedAt: null },
  });

  if (!runnerKey) return res.status(401).json({ error: "Unknown runner key" });
  if (!runnerKey.trusted) return res.status(403).json({ error: "Runner key not yet trusted" });

  // Signing string: endpoint-specific canonical string stored in req
  const signingString: string = (req as any).signingString;
  if (!verifyData(signingString, signature, publicKey)) {
    return res.status(401).json({ error: "Invalid runner signature" });
  }

  (req as any).runnerKey = runnerKey;
  next();
};
```

- [ ] **Step 2: Add combined broker auth middleware**

```typescript
// Accepts either x-broker-secret (existing) or trusted runner headers.
// Sets req.brokerMode = 'secret' | 'runner' and req.brokerCount cap.
const authorizeBrokerOrRunner = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const secret = req.headers["x-broker-secret"];
  const publicKey = req.headers["x-worker-public-key"] as string;

  if (secret) {
    // Path A: existing broker secret
    if (secret !== process.env.BROKER_SECRET) {
      console.warn(`[Broker] Unauthorized secret from ${req.ip}`);
      return res.status(401).json({ error: "Unauthorized broker access" });
    }
    (req as any).brokerMode = "secret";
    return next();
  }

  if (publicKey) {
    // Path B: trusted runner
    const signature = req.headers["x-worker-signature"] as string;
    if (!signature) return res.status(401).json({ error: "Missing x-worker-signature" });

    const runnerKey = await prisma.runnerKey.findFirst({
      where: { publicKey, revokedAt: null },
    });
    if (!runnerKey) return res.status(401).json({ error: "Unknown runner key" });
    if (!runnerKey.trusted) return res.status(403).json({ error: "Runner key not yet trusted" });

    // Canonical signing string: "next-jobs:<count>" or "submit:<jobId>:<matchId>"
    // Built by the route handler before auth runs — use raw body fields
    const count = req.body.count ?? 1;
    const jobId = req.body.jobId ?? "";
    const matchId = req.body.matchId ?? "";
    const path = req.path;

    let signingString = "";
    if (path.endsWith("next-jobs")) signingString = `next-jobs:${count}`;
    else if (path.endsWith("submit")) signingString = `submit:${jobId}:${matchId}`;

    if (!verifyData(signingString, signature, publicKey)) {
      return res.status(401).json({ error: "Invalid runner signature" });
    }

    (req as any).brokerMode = "runner";
    (req as any).runnerKey = runnerKey;
    return next();
  }

  return res.status(401).json({ error: "No broker credentials provided" });
};
```

- [ ] **Step 3: Replace `authorizeBroker` on broker routes**

Find these two lines:

```typescript
app.post("/api/broker/next-jobs", authorizeBroker, async (req, res) => {
```
```typescript
app.post("/api/broker/submit", authorizeBroker, async (req, res) => {
```

Replace both occurrences of `authorizeBroker` with `authorizeBrokerOrRunner`:

```typescript
app.post("/api/broker/next-jobs", authorizeBrokerOrRunner, async (req, res) => {
```
```typescript
app.post("/api/broker/submit", authorizeBrokerOrRunner, async (req, res) => {
```

- [ ] **Step 4: Update batch cap in next-jobs**

Find:
```typescript
const count = Math.min(100, Math.max(1, req.body.count || 1));
```

Replace with:
```typescript
const brokerMode = (req as any).brokerMode;
const count = brokerMode === "runner"
  ? Math.min(100, Math.max(1, req.body.count || 1))
  : Math.min(10, Math.max(1, req.body.count || 1));
```

- [ ] **Step 5: Filter job types for trusted runners in next-jobs**

In the next-jobs transaction, find the raw SQL query:
```typescript
WHERE status = 'pending' AND "runAt" <= NOW() AND "jobType" = 'match_run'
```

Replace with:
```typescript
const brokerMode = (req as any).brokerMode;
const matchTypeFilter = brokerMode === "runner"
  ? `AND m."matchType" = 'rating'`
  : "";
```

Then update the full query:

```typescript
const pendingJobs = (await tx.$queryRawUnsafe(`
  SELECT j.id FROM "Job" j
  JOIN "Match" m ON (j."payloadJson"->>'matchId') = m.id::text
  WHERE j.status = 'pending' AND j."runAt" <= NOW() AND j."jobType" = 'match_run'
  ${brokerMode === "runner" ? "AND m.\"matchType\" = 'rating'" : ""}
  ORDER BY j."runAt" ASC
  LIMIT ${count}
  FOR UPDATE SKIP LOCKED
`)) as any[];
```

- [ ] **Step 6: Verify API compiles**

```bash
cd D:/Github/chess-agents/apps/api
npm run dev
```

Expected: starts with no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "feat: add dual-auth middleware for broker endpoints (secret + trusted runner)"
```

---

## Task 7: API — Sign Job Payloads in next-jobs

**Files:**
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Add hash and signature to job package construction**

In `next-jobs`, find the job package construction block that returns the object with `jobId`, `matchId`, `challenger`, `defender`, etc.:

```typescript
return {
  jobId: job.id,
  matchId: match.id,
  matchType: match.matchType,
  timeControl: match.timeControl,
  gamesPlanned: match.gamesPlanned,
  challenger: {
    id: match.challengerEngineId,
    name: match.challengerEngine.name,
    language: match.challengerVersion.language,
    code: challengerCode
  },
  defender: {
    id: match.defenderEngineId,
    name: match.defenderEngine.name,
    language: match.defenderVersion.language,
    code: defenderCode
  }
};
```

Replace with:

```typescript
const challengerHash = hashData(challengerCode);
const defenderHash = hashData(defenderCode);
const signingString = match.id + challengerHash + defenderHash;
const serverSignature = signData(signingString, serverPrivateKey);

return {
  jobId: job.id,
  matchId: match.id,
  matchType: match.matchType,
  timeControl: match.timeControl,
  gamesPlanned: match.gamesPlanned,
  challenger: {
    id: match.challengerEngineId,
    name: match.challengerEngine.name,
    language: match.challengerVersion.language,
    code: challengerCode
  },
  defender: {
    id: match.defenderEngineId,
    name: match.defenderEngine.name,
    language: match.defenderVersion.language,
    code: defenderCode
  },
  challengerHash,
  defenderHash,
  serverSignature,
};
```

- [ ] **Step 2: Verify API compiles**

```bash
cd D:/Github/chess-agents/apps/api
npm run dev
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "feat: sign job payloads with server Ed25519 key in next-jobs response"
```

---

## Task 8: API — Submit Attribution + jobsProcessed

**Files:**
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Update submit to attribute trusted runner**

In the `POST /api/broker/submit` handler, find where the match is updated to `completed` status. It will look like:

```typescript
prisma.match.update({
  where: { id: matchId },
  data: {
    status: "completed",
    ...
    processedBy: ...
  }
}),
```

Update the `processedBy` value to use the runner's public key when in runner mode:

```typescript
const brokerMode = (req as any).brokerMode;
const runnerKey = (req as any).runnerKey;
const processedByValue = brokerMode === "runner" && runnerKey
  ? `runner:${runnerKey.publicKey.slice(0, 40)}`
  : `broker-${req.body.brokerId || "external"}`;
```

Then use `processedByValue` in the `processedBy` field of the match update.

- [ ] **Step 2: Increment jobsProcessed after successful submit**

At the end of the `broker/submit` handler, just before `res.json({ success: true })`, add:

```typescript
if (brokerMode === "runner" && runnerKey) {
  await prisma.runnerKey.update({
    where: { id: runnerKey.id },
    data: { jobsProcessed: { increment: 1 } },
  });
}
```

- [ ] **Step 3: Verify API compiles**

```bash
cd D:/Github/chess-agents/apps/api
npm run dev
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "feat: attribute match results to runner key and track jobsProcessed"
```

---

## Task 9: Worker — Community Runner Mode (broker-runner.ts)

**Files:**
- Create: `apps/worker/src/broker-runner.ts`

- [ ] **Step 1: Create broker-runner.ts**

```typescript
// apps/worker/src/broker-runner.ts
import dotenv from "dotenv";
dotenv.config();

import fs from "fs/promises";
import path from "path";
import os from "os";
import { hashData, signData, verifyData } from "./crypto";
import { runMatch } from "./matchmaking/runner";

const API_URL = (process.env.API_URL || "http://localhost:3001").replace(/\/$/, "");
const WORKER_PUBLIC_KEY = process.env.WORKER_PUBLIC_KEY || "";
const WORKER_PRIVATE_KEY = process.env.WORKER_PRIVATE_KEY || "";
const POLL_INTERVAL_MS = 2000;

let serverPublicKey = "";

async function fetchServerPublicKey(): Promise<void> {
  const res = await fetch(`${API_URL}/api/public-key`);
  if (!res.ok) throw new Error("Failed to fetch server public key");
  const data = await res.json() as { publicKey: string };
  serverPublicKey = data.publicKey;
  console.log("[BrokerRunner] Server public key loaded.");
}

function buildSigningString(endpoint: "next-jobs" | "submit", fields: Record<string, any>): string {
  if (endpoint === "next-jobs") return `next-jobs:${fields.count}`;
  if (endpoint === "submit") return `submit:${fields.jobId}:${fields.matchId}`;
  return "";
}

async function signedPost(endpoint: string, body: object): Promise<Response> {
  const endpointKey = endpoint.includes("next-jobs") ? "next-jobs" : "submit";
  const signingString = buildSigningString(endpointKey as any, body);
  const signature = signData(signingString, WORKER_PRIVATE_KEY);

  return fetch(`${API_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-worker-public-key": WORKER_PUBLIC_KEY,
      "x-worker-signature": signature,
    },
    body: JSON.stringify(body),
  });
}

async function verifyJobIntegrity(job: any): Promise<boolean> {
  const challengerHash = hashData(job.challenger.code);
  const defenderHash = hashData(job.defender.code);

  if (challengerHash !== job.challengerHash) {
    console.error(`[BrokerRunner] Challenger code hash mismatch for match ${job.matchId}. Possible tamper!`);
    return false;
  }

  if (defenderHash !== job.defenderHash) {
    console.error(`[BrokerRunner] Defender code hash mismatch for match ${job.matchId}. Possible tamper!`);
    return false;
  }

  const signingString = job.matchId + job.challengerHash + job.defenderHash;
  if (!verifyData(signingString, job.serverSignature, serverPublicKey)) {
    console.error(`[BrokerRunner] Server signature invalid for match ${job.matchId}. Possible tamper!`);
    return false;
  }

  return true;
}

async function processJob(job: any): Promise<void> {
  console.log(`[BrokerRunner] Running match ${job.matchId}...`);

  const valid = await verifyJobIntegrity(job);
  if (!valid) {
    console.error(`[BrokerRunner] Skipping match ${job.matchId} — integrity check failed.`);
    return;
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "broker-match-"));
  const challengerExt = job.challenger.language === "py" ? ".py" : ".js";
  const defenderExt = job.defender.language === "py" ? ".py" : ".js";
  const pathA = path.join(tempDir, `agent_a${challengerExt}`);
  const pathB = path.join(tempDir, `agent_b${defenderExt}`);

  try {
    await fs.writeFile(pathA, job.challenger.code);
    await fs.writeFile(pathB, job.defender.code);

    const result = await runMatch(
      { path: pathA, language: job.challenger.language, name: job.challenger.name },
      { path: pathB, language: job.defender.language, name: job.defender.name },
      { games: job.gamesPlanned }
    );

    let challengerWins = 0, defenderWins = 0, draws = 0;
    for (const g of result.games) {
      const isChallengerWhite = g.round % 2 !== 0;
      if (g.result === "1-0") { isChallengerWhite ? challengerWins++ : defenderWins++; }
      else if (g.result === "0-1") { isChallengerWhite ? defenderWins++ : challengerWins++; }
      else if (g.result === "1/2-1/2") { draws++; }
    }

    const challengerScore = challengerWins + draws * 0.5;
    const defenderScore = defenderWins + draws * 0.5;
    const totalGames = challengerWins + defenderWins + draws;

    const submitRes = await signedPost("/api/broker/submit", {
      jobId: job.jobId,
      matchId: job.matchId,
      pgn: result.pgn,
      result: challengerScore > defenderScore ? "challenger" : defenderScore > challengerScore ? "defender" : "draw",
      challengerScore,
      defenderScore,
    });

    if (!submitRes.ok) {
      const err = await submitRes.json().catch(() => ({})) as any;
      console.error(`[BrokerRunner] Submit failed for ${job.matchId}: ${err.error || submitRes.status}`);
    } else {
      console.log(`[BrokerRunner] Match ${job.matchId} submitted. Score: ${challengerScore}-${defenderScore}`);
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function pollBrokerJobs(): Promise<void> {
  try {
    const res = await signedPost("/api/broker/next-jobs", { count: 1 });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as any;
      console.error(`[BrokerRunner] Failed to fetch jobs: ${err.error || res.status}`);
    } else {
      const jobs = await res.json() as any[];
      for (const job of jobs) {
        await processJob(job);
      }
    }
  } catch (err) {
    console.error("[BrokerRunner] Poll error:", err);
  }

  setTimeout(pollBrokerJobs, POLL_INTERVAL_MS);
}

export async function startBrokerRunner(): Promise<void> {
  if (!WORKER_PUBLIC_KEY || !WORKER_PRIVATE_KEY) {
    throw new Error("WORKER_PUBLIC_KEY and WORKER_PRIVATE_KEY env vars required for public mode");
  }

  console.log("[BrokerRunner] Starting community runner mode...");
  await fetchServerPublicKey();
  pollBrokerJobs();
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd D:/Github/chess-agents/apps/worker
npx tsx --no-warnings -e "import('./src/broker-runner').then(() => console.log('OK'))"
```

Expected: `OK` with no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/worker/src/broker-runner.ts
git commit -m "feat: add community broker runner mode to worker"
```

---

## Task 10: Worker — Mode Detection in index.ts

**Files:**
- Modify: `apps/worker/src/index.ts`

- [ ] **Step 1: Add mode detection at the bottom of index.ts**

Find the last three lines of `apps/worker/src/index.ts`:

```typescript
console.log(`Chess Agents Worker started with ID: ${WORKER_ID}`);
pollJobs();
pollScheduler();
pollReaper();
```

Replace with:

```typescript
const isPublicMode = process.argv.includes("--mode") && process.argv[process.argv.indexOf("--mode") + 1] === "public";

if (isPublicMode) {
  import("./broker-runner").then(({ startBrokerRunner }) => {
    startBrokerRunner().catch((err) => {
      console.error("[Worker] Failed to start broker runner:", err);
      process.exit(1);
    });
  });
} else {
  console.log(`Chess Agents Worker started with ID: ${WORKER_ID}`);
  pollJobs();
  pollScheduler();
  pollReaper();
}
```

- [ ] **Step 2: Test mode flag parses correctly**

```bash
cd D:/Github/chess-agents/apps/worker
npx tsx src/index.ts --mode public 2>&1 | head -5
```

Expected: `[BrokerRunner] Starting community runner mode...` followed by an error about missing env vars — that's correct, no keys set in env.

- [ ] **Step 3: Commit**

```bash
git add apps/worker/src/index.ts
git commit -m "feat: detect --mode public flag to launch community broker runner"
```

---

## Task 11: ApiClient — Runner Methods

**Files:**
- Modify: `apps/web/src/lib/apiClient.ts`

- [ ] **Step 1: Add runner methods to ApiClient**

At the end of the `ApiClient` class (before the closing `}`), add:

```typescript
// --- RUNNER METHODS ---

static async getMyRunnerKey(userId: string) {
  return this.request<any | null>("/api/runners/me", {
    headers: { "x-user-id": userId },
  });
}

static async getAdminRunners(adminUserId: string): Promise<any[]> {
  return this.adminRequest("/api/admin/runners", adminUserId);
}

static async createRunnerKey(adminUserId: string, userId: string, label?: string): Promise<any> {
  return this.adminRequest("/api/admin/runners", adminUserId, {
    method: "POST",
    body: JSON.stringify({ userId, label }),
  });
}

static async setRunnerTrust(adminUserId: string, keyId: string, trusted: boolean): Promise<any> {
  return this.adminRequest(`/api/admin/runners/${keyId}/trust`, adminUserId, {
    method: "PATCH",
    body: JSON.stringify({ trusted }),
  });
}

static async revokeRunnerKey(adminUserId: string, keyId: string): Promise<any> {
  return this.adminRequest(`/api/admin/runners/${keyId}`, adminUserId, {
    method: "DELETE",
  });
}
```

- [ ] **Step 2: Verify web app compiles**

```bash
cd D:/Github/chess-agents/apps/web
npm run build 2>&1 | tail -10
```

Expected: build succeeds or only pre-existing errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/apiClient.ts
git commit -m "feat: add runner key methods to ApiClient"
```

---

## Task 12: Admin — Runners Page

**Files:**
- Create: `apps/web/src/app/admin/runners/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { ApiClient } from "@/lib/apiClient";
import { toast } from "sonner";
import { Shield, ShieldOff, Trash2, Terminal, Copy, CheckCircle, XCircle, Plus, X } from "lucide-react";

export default function RunnersAdmin() {
  const { data: session } = useSession();
  const [runners, setRunners] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUserId, setNewUserId] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [oneTimeKey, setOneTimeKey] = useState<{ privateKey: string; label: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const userId = (session?.user as any)?.id;

  const fetchData = async () => {
    if (!userId) return;
    try {
      const [runnersData, usersData] = await Promise.all([
        ApiClient.getAdminRunners(userId),
        ApiClient.getAdminUsers(userId),
      ]);
      setRunners(runnersData);
      setUsers(usersData);
    } catch {
      toast.error("Failed to load runners");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [session]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserId) return toast.error("Select a user");
    setCreating(true);
    try {
      const result = await ApiClient.createRunnerKey(userId, newUserId, newLabel || undefined);
      setOneTimeKey({ privateKey: result.privateKey, label: result.label || result.id });
      setNewUserId("");
      setNewLabel("");
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to create key");
    } finally {
      setCreating(false);
    }
  };

  const handleTrust = async (id: string, trusted: boolean) => {
    try {
      await ApiClient.setRunnerTrust(userId, id, trusted);
      toast.success(trusted ? "Runner trusted" : "Trust revoked");
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to update trust");
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm("Revoke this runner key? This cannot be undone.")) return;
    try {
      await ApiClient.revokeRunnerKey(userId, id);
      toast.success("Runner key revoked");
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to revoke");
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCloseModal = () => {
    if (!confirmed) {
      if (!confirm("You haven't confirmed you copied the key. Close anyway? The private key cannot be shown again.")) return;
    }
    setOneTimeKey(null);
    setConfirmed(false);
    setCopied(false);
  };

  if (loading) return <div className="text-white/40 text-sm font-mono">Loading...</div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Runner Keys</h1>
        <p className="text-white/40 text-sm mt-1 font-mono">Manage trusted community runner credentials</p>
      </div>

      {/* Create Form */}
      <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-white/70 uppercase tracking-widest mb-4">Generate Runner Key</h2>
        <form onSubmit={handleCreate} className="flex flex-wrap gap-3">
          <select
            value={newUserId}
            onChange={(e) => setNewUserId(e.target.value)}
            className="bg-black/40 border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-purple-500"
          >
            <option value="">Select user...</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.username || u.email || u.id}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Label (optional)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className="bg-black/40 border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-purple-500 w-48"
          />
          <button
            type="submit"
            disabled={creating}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            <Plus size={14} /> {creating ? "Generating..." : "Generate Key"}
          </button>
        </form>
      </div>

      {/* Runners Table */}
      <div className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-white/40 text-xs uppercase tracking-widest font-mono">
              <th className="px-6 py-4 text-left">User</th>
              <th className="px-6 py-4 text-left">Label</th>
              <th className="px-6 py-4 text-left">Public Key</th>
              <th className="px-6 py-4 text-left">Trusted</th>
              <th className="px-6 py-4 text-left">Jobs</th>
              <th className="px-6 py-4 text-left">Status</th>
              <th className="px-6 py-4 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {runners.map((r) => (
              <tr key={r.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                <td className="px-6 py-4 text-white/70 font-mono text-xs">{r.user?.username || r.user?.email || r.userId}</td>
                <td className="px-6 py-4 text-white/50 text-xs">{r.label || "—"}</td>
                <td className="px-6 py-4 font-mono text-xs text-white/40">{r.publicKey?.slice(27, 47)}...</td>
                <td className="px-6 py-4">
                  {r.trusted
                    ? <span className="flex items-center gap-1 text-green-400 text-xs font-mono"><CheckCircle size={12} /> Trusted</span>
                    : <span className="flex items-center gap-1 text-amber-400 text-xs font-mono"><XCircle size={12} /> Pending</span>}
                </td>
                <td className="px-6 py-4 text-white/50 font-mono text-xs">{r.jobsProcessed}</td>
                <td className="px-6 py-4">
                  {r.revokedAt
                    ? <span className="text-red-400 text-xs font-mono">Revoked</span>
                    : <span className="text-green-400 text-xs font-mono">Active</span>}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    {!r.revokedAt && (
                      <>
                        <button
                          onClick={() => handleTrust(r.id, !r.trusted)}
                          className="p-1.5 rounded-lg hover:bg-white/5 text-white/40 hover:text-purple-400 transition-colors"
                          title={r.trusted ? "Revoke trust" : "Grant trust"}
                        >
                          {r.trusted ? <ShieldOff size={14} /> : <Shield size={14} />}
                        </button>
                        <button
                          onClick={() => handleRevoke(r.id)}
                          className="p-1.5 rounded-lg hover:bg-white/5 text-white/40 hover:text-red-400 transition-colors"
                          title="Revoke key"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {runners.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-white/20 font-mono text-xs">No runner keys yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* One-Time Private Key Modal */}
      {oneTimeKey && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0d0d0d] border border-white/10 rounded-2xl p-8 max-w-xl w-full space-y-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <Terminal size={20} className="text-green-400" />
                <div>
                  <h3 className="text-white font-bold text-lg">Runner Private Key</h3>
                  <p className="text-xs text-white/40 font-mono mt-0.5">{oneTimeKey.label}</p>
                </div>
              </div>
              <button onClick={handleCloseModal} className="text-white/30 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
              <p className="text-red-400 text-sm font-semibold">This is the only time this private key will be shown.</p>
              <p className="text-red-300/70 text-xs mt-1">Store it securely before closing. It cannot be recovered.</p>
            </div>

            <div className="relative">
              <pre className="bg-black/60 border border-white/10 rounded-xl p-4 text-green-400 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all">
                {oneTimeKey.privateKey}
              </pre>
              <button
                onClick={() => handleCopy(oneTimeKey.privateKey)}
                className="absolute top-3 right-3 p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-colors"
              >
                {copied ? <CheckCircle size={14} className="text-green-400" /> : <Copy size={14} />}
              </button>
            </div>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="w-4 h-4 accent-purple-500"
              />
              <span className="text-white/70 text-sm">I have copied and securely stored my private key</span>
            </label>

            <button
              onClick={handleCloseModal}
              disabled={!confirmed}
              className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
            >
              Done — Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/admin/runners/page.tsx
git commit -m "feat: add admin runners page with key management and one-time modal"
```

---

## Task 13: Admin Layout — Add Runners Nav Item

**Files:**
- Modify: `apps/web/src/app/admin/layout.tsx`

- [ ] **Step 1: Add Terminal import and Runners nav link**

In `apps/web/src/app/admin/layout.tsx`, find the import block:

```typescript
import { 
  LayoutDashboard,
  Users,
  Cpu, 
  ListOrdered,
  LogOut,
  Trophy
} from "lucide-react";
```

Add `Terminal` to the import:

```typescript
import { 
  LayoutDashboard,
  Users,
  Cpu, 
  ListOrdered,
  LogOut,
  Trophy,
  Terminal
} from "lucide-react";
```

- [ ] **Step 2: Add Runners nav item**

Find:
```tsx
<SidebarItem href="/admin/jobs" icon={<ListOrdered size={20} />} label="Job Queue" />
```

Add after it:
```tsx
<SidebarItem href="/admin/runners" icon={<Terminal size={20} />} label="Runners" />
```

- [ ] **Step 3: Verify web build**

```bash
cd D:/Github/chess-agents/apps/web
npm run build 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/admin/layout.tsx
git commit -m "feat: add Runners nav item to admin sidebar"
```

---

## Task 14: Web — /run Page

**Files:**
- Create: `apps/web/src/app/run/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
import { auth } from "@/lib/auth";
import { ApiClient } from "@/lib/apiClient";
import { Terminal, Shield, Zap, Copy, CheckCircle, XCircle, Clock, Server, Code2, ChevronRight } from "lucide-react";
import Link from "next/link";
import { RunnerDashboard } from "./RunnerDashboard";

export const dynamic = "force-dynamic";

export default async function RunPage() {
  const session = await auth();
  const userId = (session?.user as any)?.id;

  let runnerKey = null;
  if (userId) {
    runnerKey = await ApiClient.getMyRunnerKey(userId).catch(() => null);
  }

  return (
    <div className="min-h-screen bg-[#050505] text-[#00ff41] font-mono relative overflow-hidden">
      {/* Scanline overlay */}
      <div
        className="pointer-events-none fixed inset-0 z-10"
        style={{
          background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)",
        }}
      />

      <div className="relative z-20 max-w-4xl mx-auto px-6 py-16 space-y-24">

        {/* Hero */}
        <section className="space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 border border-[#00ff41]/20 text-[#00ff41]/60 text-xs rounded">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00ff41] animate-pulse" />
            DECENTRALIZED COMPUTE NETWORK
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-[#00ff41] leading-tight">
            Run the Arena.<br />
            <span className="text-[#00ff41]/40">Power the Competition.</span>
          </h1>
          <p className="text-[#00ff41]/60 text-lg max-w-2xl leading-relaxed">
            Chess Agents runs 24/7 on community compute. Trusted runners fetch signed match jobs, 
            execute them locally, and submit cryptographically-attributed results back to the arena. 
            Every job is tamper-proof. Every runner is accountable.
          </p>
          <div className="flex items-center gap-6 pt-2">
            {session ? (
              <a href="#dashboard" className="flex items-center gap-2 px-5 py-2.5 bg-[#00ff41] text-black font-bold text-sm hover:bg-[#00ff41]/90 transition-colors">
                View My Runner Key <ChevronRight size={14} />
              </a>
            ) : (
              <Link href="/api/auth/signin" className="flex items-center gap-2 px-5 py-2.5 bg-[#00ff41] text-black font-bold text-sm hover:bg-[#00ff41]/90 transition-colors">
                Sign In to Get Started <ChevronRight size={14} />
              </Link>
            )}
          </div>
        </section>

        {/* How It Works */}
        <section className="space-y-8">
          <h2 className="text-xs uppercase tracking-widest text-[#00ff41]/40 border-b border-[#00ff41]/10 pb-3">
            HOW IT WORKS
          </h2>
          <div className="bg-black/40 border border-[#00ff41]/10 rounded p-6 text-sm text-[#00ff41]/70 leading-loose">
            <pre className="whitespace-pre-wrap">{`
[Your Runner]  ──── POST /api/broker/next-jobs ────▶  [Arena API]
               ◀─── Job + serverSignature ───────────

[Your Runner]  ──── verifySignature(job) ──────────▶  ✓ or ✗
               ──── verifyCodeHashes(job) ──────────▶  ✓ or ✗

[Your Runner]  ──── runMatch(challenger, defender) ─▶  [Local Chess Engine]
               ◀─── result (PGN + scores) ───────────

[Your Runner]  ──── POST /api/broker/submit ────────▶  [Arena API]
               ◀─── { success: true } ──────────────
`.trim()}</pre>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { icon: <Shield size={18} />, title: "Signed Jobs", desc: "Every job payload is Ed25519-signed by the server. Your runner verifies before executing — no tampered code ever runs." },
              { icon: <Code2 size={18} />, title: "Hash Verified", desc: "Engine code is SHA-256 hashed before dispatch. Your runner re-hashes on arrival and rejects any mismatch." },
              { icon: <Server size={18} />, title: "Attributed Results", desc: "Every submitted result is signed with your runner key and tracked. Your contribution is permanently recorded." },
            ].map((item) => (
              <div key={item.title} className="border border-[#00ff41]/10 rounded p-5 space-y-3">
                <div className="text-[#00ff41]/60">{item.icon}</div>
                <h3 className="text-[#00ff41] text-sm font-bold">{item.title}</h3>
                <p className="text-[#00ff41]/50 text-xs leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Quickstart */}
        <section className="space-y-6">
          <h2 className="text-xs uppercase tracking-widest text-[#00ff41]/40 border-b border-[#00ff41]/10 pb-3">
            QUICKSTART
          </h2>
          <p className="text-[#00ff41]/60 text-sm">Once you have a trusted runner key from an admin, run:</p>
          <div className="relative">
            <pre className="bg-black border border-[#00ff41]/20 rounded p-5 text-[#00ff41] text-sm overflow-x-auto">
{`docker run \\
  -e API_URL=https://api.chessagents.dev \\
  -e WORKER_PUBLIC_KEY="<your-public-key>" \\
  -e WORKER_PRIVATE_KEY="<your-private-key>" \\
  jaymaart/chess-worker --mode public`}
            </pre>
          </div>
          <div className="space-y-3 text-sm text-[#00ff41]/60">
            <p>Or run directly with Node.js:</p>
            <pre className="bg-black border border-[#00ff41]/20 rounded p-5 text-[#00ff41] text-sm overflow-x-auto">
{`API_URL=https://api.chessagents.dev \\
WORKER_PUBLIC_KEY="..." \\
WORKER_PRIVATE_KEY="..." \\
node dist/index.js --mode public`}
            </pre>
          </div>
        </section>

        {/* Requirements */}
        <section className="space-y-6">
          <h2 className="text-xs uppercase tracking-widest text-[#00ff41]/40 border-b border-[#00ff41]/10 pb-3">
            REQUIREMENTS & LIMITS
          </h2>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            {[
              ["Account", "Required — runner key is tied to your user account"],
              ["Admin Approval", "Your key must be marked trusted before jobs are served"],
              ["Max Batch Size", "100 jobs per request"],
              ["Supported Languages", "JavaScript (.js), Python (.py)"],
              ["Match Type", "Rating matches only (placement is reserved)"],
              ["Hardware", "Any machine capable of running Node.js 18+ or Python 3.10+"],
              ["Docker", "Optional — docker image available for easy setup"],
              ["Uptime", "No minimum — run as much or as little as you like"],
            ].map(([key, val]) => (
              <div key={key} className="flex gap-3 border border-[#00ff41]/10 rounded p-4">
                <span className="text-[#00ff41]/40 shrink-0 w-36">{key}</span>
                <span className="text-[#00ff41]/70">{val}</span>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="space-y-6">
          <h2 className="text-xs uppercase tracking-widest text-[#00ff41]/40 border-b border-[#00ff41]/10 pb-3">
            FAQ
          </h2>
          <div className="space-y-4">
            {[
              {
                q: "Do I need an account?",
                a: "Yes. Runner keys are tied to your Chess Agents account. Sign up, then contact an admin to request a runner key."
              },
              {
                q: "How do I get a runner key?",
                a: "After signing up, reach out to an admin. They generate a keypair server-side and share your private key once — it's never shown again, so store it securely."
              },
              {
                q: "What hardware do I need?",
                a: "Anything that can run Docker or Node.js 18+. A basic VPS or spare laptop is sufficient. No GPU required."
              },
              {
                q: "What matches will I run?",
                a: "Rating matches only. Placement matches (for newly validated engines) are reserved for the internal runner."
              },
              {
                q: "What if my runner submits a bad result?",
                a: "The server validates all submissions — game count, player identity, and score integrity. Bad submissions are rejected. Repeated failures can result in key revocation."
              },
              {
                q: "Is my private key safe?",
                a: "Your private key is shown exactly once at issuance. Treat it like a password. If you believe it's been compromised, contact an admin to revoke it and issue a new one."
              },
              {
                q: "What happens if someone tampers with my job?",
                a: "Your runner verifies the server's Ed25519 signature and re-hashes the engine code before executing. Any tampered payload is silently rejected — no malicious code runs."
              },
              {
                q: "Will there be a leaderboard?",
                a: "Your jobs processed count is tracked and shown on this page. A public leaderboard is planned for future releases."
              },
            ].map((item) => (
              <details key={item.q} className="group border border-[#00ff41]/10 rounded">
                <summary className="px-5 py-4 text-sm text-[#00ff41]/80 cursor-pointer hover:text-[#00ff41] transition-colors list-none flex items-center justify-between">
                  {item.q}
                  <ChevronRight size={14} className="group-open:rotate-90 transition-transform text-[#00ff41]/30" />
                </summary>
                <div className="px-5 pb-4 text-xs text-[#00ff41]/50 leading-relaxed">{item.a}</div>
              </details>
            ))}
          </div>
        </section>

        {/* Runner Dashboard */}
        {session && (
          <section id="dashboard" className="space-y-6">
            <h2 className="text-xs uppercase tracking-widest text-[#00ff41]/40 border-b border-[#00ff41]/10 pb-3">
              YOUR RUNNER
            </h2>
            <RunnerDashboard initialKey={runnerKey} userId={userId} />
          </section>
        )}

        {!session && (
          <section className="border border-[#00ff41]/10 rounded p-8 text-center space-y-4">
            <Terminal size={32} className="mx-auto text-[#00ff41]/30" />
            <h3 className="text-[#00ff41]/70 font-bold">Sign in to view your runner status</h3>
            <p className="text-[#00ff41]/40 text-sm">Your runner key and stats are linked to your account.</p>
            <Link href="/api/auth/signin" className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#00ff41] text-black font-bold text-sm hover:bg-[#00ff41]/90 transition-colors mt-2">
              Sign In
            </Link>
          </section>
        )}

      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the RunnerDashboard client component**

Create `apps/web/src/app/run/RunnerDashboard.tsx`:

```tsx
"use client";

import { CheckCircle, XCircle, Clock, Zap, Copy } from "lucide-react";
import { useState } from "react";

export function RunnerDashboard({ initialKey, userId }: { initialKey: any; userId: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!initialKey) {
    return (
      <div className="border border-[#00ff41]/10 rounded p-8 text-center space-y-3">
        <XCircle size={28} className="mx-auto text-[#00ff41]/20" />
        <p className="text-[#00ff41]/50 text-sm">No runner key found for your account.</p>
        <p className="text-[#00ff41]/30 text-xs">Contact an admin to get registered as a runner.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="border border-[#00ff41]/10 rounded p-5 space-y-1">
          <div className="text-xs text-[#00ff41]/40 uppercase tracking-widest">Status</div>
          <div className="flex items-center gap-2 text-sm font-bold">
            {initialKey.revokedAt ? (
              <span className="text-red-400 flex items-center gap-1"><XCircle size={14} /> Revoked</span>
            ) : initialKey.trusted ? (
              <span className="text-[#00ff41] flex items-center gap-1"><CheckCircle size={14} /> Trusted</span>
            ) : (
              <span className="text-amber-400 flex items-center gap-1"><Clock size={14} /> Pending Approval</span>
            )}
          </div>
        </div>
        <div className="border border-[#00ff41]/10 rounded p-5 space-y-1">
          <div className="text-xs text-[#00ff41]/40 uppercase tracking-widest">Jobs Processed</div>
          <div className="flex items-center gap-2 text-2xl font-bold text-[#00ff41]">
            <Zap size={18} className="text-[#00ff41]/50" />
            {initialKey.jobsProcessed}
          </div>
        </div>
        <div className="border border-[#00ff41]/10 rounded p-5 space-y-1">
          <div className="text-xs text-[#00ff41]/40 uppercase tracking-widest">Key Issued</div>
          <div className="text-sm text-[#00ff41]/70">
            {new Date(initialKey.createdAt).toLocaleDateString()}
          </div>
        </div>
      </div>

      <div className="border border-[#00ff41]/10 rounded p-5 space-y-2">
        <div className="text-xs text-[#00ff41]/40 uppercase tracking-widest mb-3">Public Key</div>
        <div className="flex items-start gap-3">
          <pre className="flex-1 text-xs text-[#00ff41]/60 font-mono whitespace-pre-wrap break-all bg-black/40 rounded p-3">
            {initialKey.publicKey}
          </pre>
          <button
            onClick={() => handleCopy(initialKey.publicKey)}
            className="p-2 border border-[#00ff41]/10 rounded hover:border-[#00ff41]/30 text-[#00ff41]/40 hover:text-[#00ff41] transition-colors shrink-0"
          >
            {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
          </button>
        </div>
      </div>

      {!initialKey.trusted && !initialKey.revokedAt && (
        <div className="border border-amber-400/20 bg-amber-400/5 rounded p-4 text-amber-400/80 text-xs">
          Your runner key is pending admin approval. Once trusted, you can start fetching jobs using the Docker command above.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify web build**

```bash
cd D:/Github/chess-agents/apps/web
npm run build 2>&1 | tail -15
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/run/
git commit -m "feat: add /run page with docs, quickstart, FAQ, and runner dashboard"
```

---

## Task 15: End-to-End Manual Verification

- [ ] **Step 1: Start API, verify server key created**

```bash
cd D:/Github/chess-agents/apps/api
npm run dev
```

Check logs for: `[Crypto] New server key generated and stored.` or `[Crypto] Server key loaded from DB.`

- [ ] **Step 2: Verify public key endpoint**

```bash
curl http://localhost:3001/api/public-key
```

Expected: `{"publicKey":"-----BEGIN PUBLIC KEY-----\n..."}`

- [ ] **Step 3: Create a runner key via admin endpoint**

```bash
curl -X POST http://localhost:3001/api/admin/runners \
  -H "Content-Type: application/json" \
  -H "x-user-id: <an-admin-user-id>" \
  -d '{"userId":"<target-user-id>","label":"test-runner"}'
```

Expected: JSON with `id`, `publicKey`, `privateKey`, `privateKeyShownOnce: true`.

- [ ] **Step 4: Trust the runner key**

```bash
curl -X PATCH http://localhost:3001/api/admin/runners/<key-id>/trust \
  -H "Content-Type: application/json" \
  -H "x-user-id: <an-admin-user-id>" \
  -d '{"trusted":true}'
```

Expected: `{"success":true,"trusted":true}`

- [ ] **Step 5: Test next-jobs with runner credentials**

Using the public key and private key from Step 3, compute signing string `"next-jobs:1"`, sign with the private key, then:

```bash
curl -X POST http://localhost:3001/api/broker/next-jobs \
  -H "Content-Type: application/json" \
  -H "x-worker-public-key: <public-key>" \
  -H "x-worker-signature: <base64-signature>" \
  -d '{"count":1}'
```

Expected: array of job objects (empty array if no pending rating matches is also valid).

- [ ] **Step 6: Start worker in public mode and confirm rejection without keys**

```bash
cd D:/Github/chess-agents/apps/worker
npx tsx src/index.ts --mode public
```

Expected: error `WORKER_PUBLIC_KEY and WORKER_PRIVATE_KEY env vars required for public mode`

- [ ] **Step 7: Verify admin /run page and /admin/runners load in browser**

Start the web app:
```bash
cd D:/Github/chess-agents/apps/web
npm run dev
```

Navigate to `http://localhost:3000/run` — verify the terminal-themed page loads with all sections.
Navigate to `http://localhost:3000/admin/runners` (as admin) — verify the Runners nav item appears and the page loads with the create form and table.

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "feat: complete decentralized signed match runner implementation"
```
