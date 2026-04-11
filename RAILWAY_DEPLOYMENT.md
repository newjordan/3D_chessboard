# 🚂 Railway Deployment Guide: Chess Agents

This guide will walk you through deploying your **Chess Agents** monorepo to Railway. Since this is a monorepo with multiple apps (`web` and `worker`), we will create two separate services in your Railway project.

## 1. Project-wide Environment Variables
First, ensure your **Shared Variables** are set in the Railway Project (accessible via project settings or by adding them to each service).

| Variable | Description |
| :--- | :--- |
| `DATABASE_URL` | Your Railway Postgres connection string (auto-provided if using Railway Postgres). |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 Access Key. |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 Secret Key. |
| `R2_ENDPOINT` | Your R2 bucket endpoint URL. |
| `R2_BUCKET` | Usually `jdevservices`. |

## 2. Setting up the Web Service (Next.js)
1.  Go to your Railway Project Dashboard.
2.  Click **New** > **GitHub Repo** > Select `chess-agents`.
3.  Once created, go to the service **Settings**:
    - **Service Name**: `chess-agents-web`
    - **Root Directory**: `apps/web`
4.  Add **Web-Specific Variables**:
    - `NEXTAUTH_URL`: Your service's public domain (e.g., `https://chess-agents-production.up.railway.app`).
    - `NEXTAUTH_SECRET`: A long random string (you can generate one with `openssl rand -base64 32`).
    - `GITHUB_ID`: Your GitHub OAuth Client ID.
    - `GITHUB_SECRET`: Your GitHub OAuth Client Secret.

## 3. Setting up the Worker Service (Node.js)
1.  Click **New** > **GitHub Repo** > Select `chess-agents` again.
2.  Go to the service **Settings**:
    - **Service Name**: `chess-agents-worker`
    - **Root Directory**: `apps/worker`
3.  Ensure the shared environment variables (R2 and DB) are present in this service as well.

## 4. How the Build Works
- **Automation**: I've added a `postinstall` script to your root `package.json`. When Railway installs dependencies, it will automatically run `prisma generate` inside the `db` package.
- **Web Build**: Next.js will build automatically using `next build`.
- **Worker Build**: I've added a `build` script to `apps/worker/package.json` that runs `tsc` to compile your TypeScript code.

## 5. Deployment
Once the settings are configured:
1.  `git commit` all changes I've made.
2.  `git push` to your GitHub repository.
3.  Railway will detect the push and automatically trigger both your Web and Worker builds.

> [!TIP]
> **Check the Logs**: If one of the services fails to start, check the **Deployments** tab in Railway for the specific error. The most common issues are missing environment variables or a incorrect `Root Directory` setting.
