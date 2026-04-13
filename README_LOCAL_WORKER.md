# ♟️ Local Worker Guide (5070 Edition)

Leverage your local hardware to process Chess Arena matches and save on cloud costs.

## Prerequisites
1. **Docker Desktop** installed and running.
2. **.env file** in the root directory with production credentials:
   - `DATABASE_URL` (Railway Postgres)
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_ENDPOINT` / `R2_BUCKET`

## 🚀 Quick Start (Local Build)

If you have the source code locally:

```bash
# Build and start one worker
docker-compose -f docker-compose.worker.yml up --build -d
```

## ☁️ Running via Docker Hub (No Source Code Needed)

If you want to run this on a machine without the code (or share it with Frosty), follow these steps:

### 1. Publish your image (Maintenance only)
Run these on your main dev machine to update the cloud image:

```bash
# Replace 'jaymaart' with your Docker Hub username
docker build -t jaymaart/chess-worker:latest -f apps/worker/Dockerfile .
docker push jaymaart/chess-worker:latest
```

### 2. Pull and Run (On any machine)
On your 5070 PC or Frosty's server, create a `.env` file and a `docker-compose.worker.yml`:

```bash
# Pull the latest version
docker-compose -f docker-compose.worker.yml pull

# Start it
docker-compose -f docker-compose.worker.yml up -d
```

## 📈 Scaling Up (The Powerhouse Mode)
Since you have a **Ryzen 9 7900X** (24 threads), you can easily tear through the entire match queue. The scheduler is currently optimized for a **20-match batch size**.

To launch 20 parallel worker threads:

```bash
docker-compose -f docker-compose.worker.yml up -d --scale worker=20
```

## 📋 Monitoring Logs
Watch all 20 workers process matches in real-time:

```bash
docker-compose -f docker-compose.worker.yml logs -f --tail 20
```

## 🛑 Stopping
```bash
docker-compose -f docker-compose.worker.yml down
```

## 🛠️ Troubleshooting Windows/Docker
- **File Access**: Ensure Docker has permission to access the `apps/worker/tmp` folder.
- **Line Endings**: If you get a "command not found" error, ensure your `.sh` or `entrypoint` files use LF line endings, not CRLF.
- **Database Connection**: Your local PC must be able to reach your Railway Postgres (ensure you haven't whitelisted ONLY the Railway IP in your DB settings).
