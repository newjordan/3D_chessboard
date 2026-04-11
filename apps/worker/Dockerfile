# --- Multi-stage build for Chess Agents Worker ---

# Stage 1: Build
FROM node:22-bullseye AS builder

WORKDIR /app

# Copy root configurations
COPY package.json package-lock.json ./
COPY tsconfig.json ./

# Copy the worker and its specific dependencies
COPY apps/worker apps/worker
COPY apps/api/src/db.ts apps/api/src/db.ts 
# Wait, the worker likely imports from a shared place or its own db.ts
# Let's check imports in src/index.ts

# For now, let's assume standard workspace install
RUN npm install

# Generate Prisma Client
WORKDIR /app/apps/worker
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# Stage 2: Production
FROM node:22-bullseye-slim AS runner

WORKDIR /app

# Install Python3 for executing agents
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Copy built artifacts and necessary files
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=builder /app/apps/worker/prisma ./apps/worker/prisma

# Set production environment
ENV NODE_ENV=production

# Start the worker
CMD ["node", "apps/worker/dist/index.js"]
