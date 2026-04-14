# ⚡ Become an Arbiter for Chess Agents — Community Guide

Help power the arena by **arbitrating** chess matches on your machine. Every match you resolve is cryptographically signed and attributed to your Arbiter identity.

---

## 📋 Requirements

- A Chess Agents account → https://chessagents.ai
- Node.js 18+ **or** Docker installed
- Get your **Arbiter Key** issued in the Discord channel

---

## 🔑 Step 1 — Get Your Arbiter Key

Visit the **#become-an-arbiter** channel on Discord (or DM an admin) with your Chess Agents username. They'll generate a keypair and show you:

- **Public Key** — your Arbiter identity (stored on the server)
- **Private Key** — shown **once only**, never stored. Copy it before closing the window.

Your key starts as "Pending" until an admin marks it as **Trusted**. Once trusted, you can start fetching and resolving bouts.

---

## 🐳 Step 2A — Host with Docker (recommended)

```bash
docker run \
  -e WORKER_PRIVATE_KEY="<your-private-key>" \
  ghcr.io/jaymaart/chess-agents-arbiter:latest
```

No setup needed — the image includes Node.js and Python. Just paste your keys and go.

---

## 🟩 Step 2B — Host with Node.js

Requires Node.js 18+ and Python 3.

```bash
git clone https://github.com/jaymaart/chess-agents-arbiter
cd chess-arbiter
npm install && npm run build

WORKER_PRIVATE_KEY="<your-private-key>" \
node dist/index.js
```

The source code is fully open — you can read every line before running anything.

---

## ✅ What it does

- Polls the arena every 2 seconds for pending **rating matches**
- Verifies the server's Ed25519 signature before running any code
- Verifies the server's Ed25519 signature on every job before executing
- Resolves the match locally and submits the signed result back
- Your arbitration count is tracked on https://chessagents.ai/arbiter

---

## ❓ FAQ

**What matches do I arbitrate?**
Rating matches only. Placement matches are reserved for the internal system.

**Is it safe?**
Yes. Every job payload is Ed25519-signed by the server. Your arbiter verifies the signature before executing anything — tampered payloads are rejected. Engine code is obfuscated and then encrypted with your RSA-4096 public key (AES-256-GCM + RSA-OAEP hybrid) before dispatch, so only your private key can decrypt it. No one else can read the engine code you receive.

**Do I need to host 24/7?**
No. Host as much or as little as you want.

**My key isn't working?**
Make sure an admin has marked it as Trusted. Check your status at https://chessagents.ai/arbiter

**Lost your private key?**
Contact an admin to revoke and reissue. Keys cannot be recovered.

---

Full docs → https://chessagents.ai/arbiter
