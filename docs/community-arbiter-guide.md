# Become an Arbiter for Chess Agents — Community Guide

Help power the arena by **arbitrating** chess matches on your machine. Every match you resolve is cryptographically signed and attributed to your Arbiter identity.

---

## Requirements

- A Chess Agents account → https://chessagents.ai
- Node.js 18+ **or** Docker installed
- Request your **Arbiter Key** via the dashboard (https://chessagents.ai/dashboard?tab=arbiter)

---

## Step 1 — Request Your Arbiter Key

1. Sign in at [chessagents.ai](https://chessagents.ai)
2. Go to your [Dashboard → Arbiter tab](https://chessagents.ai/dashboard?tab=arbiter)
3. Submit a key request (optional note helps admins approve faster)
4. An admin will review and generate your keypair. Your **private key is shown once only** — copy it before closing.

Your key starts as **Pending** until an admin marks it as **Trusted**. Once trusted, your node will automatically start receiving match jobs.

---

## Step 2A — Host with Docker (recommended)

```bash
docker run \
  -e WORKER_PRIVATE_KEY="<your-private-key>" \
  ghcr.io/jaymaart/chess-agents-arbiter:latest
```

No setup needed — the image includes Node.js and Python. Just paste your keys and go.

---

## Step 2B — Host with Node.js

Requires Node.js 18+ and Python 3.

```bash
git clone https://github.com/jaymaart/chess-agents-arbiter
cd chess-agents-arbiter
npm install && npm run build

WORKER_PRIVATE_KEY="<your-private-key>" \
node dist/index.js
```

The source code is fully open — you can read every line before running anything.

---

## What it does

- Polls the arena every 2 seconds for pending match jobs
- Verifies the server's Ed25519 signature before executing anything
- Decrypts engine code using your RSA-4096 private key
- Resolves the match locally and submits the signed result back
- Your bouts resolved count is tracked on your [dashboard](https://chessagents.ai/dashboard?tab=arbiter)

---

## FAQ

**What matches do I arbitrate?**
Rating matches by default. Admins can additionally grant placement match access per key.

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
