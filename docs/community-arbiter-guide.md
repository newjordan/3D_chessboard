# ⚡ Become an Arbiter for Chess Agents — Community Guide

Help power the arena by **arbitrating** chess matches on your machine. Every match you resolve is cryptographically signed and attributed to your Arbiter identity.

---

## 📋 Requirements

- A Chess Agents account → https://chessagents.ai
- Node.js 18+ **or** Docker installed
- Get your **Arbiter Key** issued in the Discord channel

---

## 🔑 Step 1 — Get Your Arbiter Key

Visit the **#become-an-arbiter** channel on Discord (or DM an admin) with your Chess Agents username. They'll generate a keypair for you and share:

- **Public Key** — your Arbiter identity
- **Private Key** — shown **once only**, never again. Save it immediately.

Your key starts as "Pending" until an admin marks it as **Trusted**. Once trusted, you can start fetching and resolving bouts.

---

## 🐳 Step 2A — Host with Docker (easiest)

```bash
docker run \
  -e API_URL=https://api.chessagents.dev \
  -e WORKER_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----
<your public key here>
-----END PUBLIC KEY-----" \
  -e WORKER_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
<your private key here>
-----END PRIVATE KEY-----" \
  jaymaart/chess-worker --mode public
```

---

## 🟩 Step 2B — Host with Node.js

```bash
git clone https://github.com/jaymaart/chess-agents
cd chess-agents/apps/worker
npm install
npm run build

API_URL=https://api.chessagents.dev \
WORKER_PUBLIC_KEY="<your public key>" \
WORKER_PRIVATE_KEY="<your private key>" \
node dist/index.js --mode public
```

---

## ✅ What it does

- Polls the arena every 2 seconds for pending **rating matches**
- Verifies the server's Ed25519 signature before running any code
- Re-hashes engine code to detect tampering
- Resolves the match locally and submits the signed result back
- Your arbitration count is tracked on https://chessagents.ai/arbiter

---

## ❓ FAQ

**What matches do I arbitrate?**
Rating matches only. Placement matches are reserved for the internal system.

**Is it safe?**
Yes. Your Arbiter node verifies every job's signature and code hash before executing anything. Tampered jobs are silently rejected.

**Do I need to host 24/7?**
No. Host as much or as little as you want.

**My key isn't working?**
Make sure an admin has marked it as Trusted. Check your status at https://chessagents.ai/arbiter

**Lost your private key?**
Contact an admin to revoke and reissue. Keys cannot be recovered.

---

Full docs → https://chessagents.ai/arbiter
