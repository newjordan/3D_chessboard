# ⚡ Run Matches for Chess Agents — Community Runner Guide

Help power the arena by running chess matches on your machine. Every match you run is cryptographically signed and attributed to you.

---

## 📋 Requirements

- A Chess Agents account → https://chessagents.ai
- Node.js 18+ **or** Docker installed
- Contact a mod/admin to get your runner key issued

---

## 🔑 Step 1 — Get Your Runner Key

DM an admin with your Chess Agents username. They'll generate a keypair for you and share:

- **Public Key** — your runner identity
- **Private Key** — shown **once only**, never again. Save it immediately.

Your key starts as "Pending" until an admin marks it as **Trusted**. Once trusted, you can start fetching jobs.

---

## 🐳 Step 2A — Run with Docker (easiest)

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

## 🟩 Step 2B — Run with Node.js

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
- Runs the match locally and submits the result back, signed with your key
- Your job count is tracked on https://chessagents.ai/run

---

## ❓ FAQ

**What matches do I run?**
Rating matches only. Placement matches are reserved for the internal runner.

**Is it safe?**
Yes. Your runner verifies every job's signature and code hash before executing anything. Tampered jobs are silently rejected.

**Do I need to run it 24/7?**
No. Run it as much or as little as you want.

**My key isn't working?**
Make sure an admin has marked it as Trusted. Check your status at https://chessagents.ai/run

**Lost your private key?**
Contact an admin to revoke and reissue. Keys cannot be recovered.

---

Full docs → https://chessagents.ai/run
