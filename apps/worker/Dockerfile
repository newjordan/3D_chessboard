# --- Multi-stage build for Chess Agents Worker ---

# Stage 1: Build
FROM node:22-bullseye AS builder

WORKDIR /app

# Copy root configuration to establish workspace context
COPY package.json package-lock.json ./
COPY tsconfig.json ./

# Copy the worker source
COPY apps/worker apps/worker

# Install dependencies (using --no-scripts to avoid parent workspace conflicts during build)
RUN npm install --ignore-scripts

# Generate Prisma Client for the worker specifically
WORKDIR /app/apps/worker
RUN npx prisma generate

# Build the worker TypeScript code
RUN npm run build

# Stage 2: Production
FROM node:22-bullseye-slim AS runner

WORKDIR /app

# Install Python3 for agent execution
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Copy root node_modules (where the prisma client is housed)
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules

# Copy worker artifacts
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=builder /app/apps/worker/prisma ./apps/worker/prisma

# Set environment
ENV NODE_ENV=production

# Start the worker
# Note: Since this is a Dockerfile, you should CLEAR the "Start Command" in Railway settings
CMD ["node", "apps/worker/dist/index.js"]
