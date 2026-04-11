/**
 * Seed script: imports all agents from seed/agents/ into the database.
 *
 * Usage:
 *   DATABASE_URL=... npx ts-node seed/import.ts
 *
 * This creates a "seed" user, then for each .js file in seed/agents/:
 *   - Creates an Engine
 *   - Uploads the file to R2
 *   - Creates an EngineVersion
 *   - Creates a Submission
 *   - Creates a validation Job
 */

import { PrismaClient } from "@prisma/client";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const prisma = new PrismaClient();

const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

const BUCKET_NAME = process.env.R2_BUCKET || "chess-agents";

const AGENTS_DIR = path.join(__dirname, "agents");

// Map filenames to display names
const NAME_MAP: Record<string, string> = {
  "blackyellow.js": "BlackYellow",
  "cagnusmarlson.js": "CagnusMarlson",
  "cheeku.js": "Cheeku",
  "chess-chad.js": "Chess Chad",
  "chessbit.js": "ChessBit",
  "claudilot.js": "Claudilot",
  "deeper-blue.js": "Deeper Blue",
  "frostd4d.js": "FrostD4D",
  "iron-knight.js": "Iron Knight",
  "mersal.js": "MERSAL",
  "rookie.js": "Rookie",
  "surfing-llamas.js": "Surfing Llamas",
  "chess-augmenter.js": "Chess Augmenter",
  "flamki.js": "Flamki",
  "pawnstorm.js": "Pawnstorm",
  "thriver.js": "Thriver",
};

async function main() {
  console.log("Starting seed import...\n");

  // 1. Create or find the seed user
  const seedUser = await prisma.user.upsert({
    where: { id: "seed-user" },
    create: {
      id: "seed-user",
      name: "Vibe Code Cup",
      username: "vibe-code-cup",
      email: "seed@chessagents.dev",
    },
    update: {},
  });
  console.log(`Seed user: ${seedUser.username} (${seedUser.id})\n`);

  // 2. Process each agent file
  const files = fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith(".js") || f.endsWith(".py"));

  for (const file of files) {
    const displayName = NAME_MAP[file] || file.replace(/\.(js|py)$/, "");
    const slug = displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const ext = path.extname(file);
    const language = ext.slice(1); // "js" or "py"

    console.log(`Importing: ${displayName} (${file})`);

    // Read file
    const buffer = fs.readFileSync(path.join(AGENTS_DIR, file));
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");

    // Check if engine already exists
    const existing = await prisma.engine.findUnique({ where: { slug } });
    if (existing) {
      console.log(`  Skipped (already exists)\n`);
      continue;
    }

    // Create engine
    const engine = await prisma.engine.create({
      data: {
        name: displayName,
        slug,
        ownerUserId: seedUser.id,
        status: "active",
        currentRating: 1200,
      },
    });

    // Upload to R2
    const storageKey = `engines/${engine.id}/${sha256}${ext}`;
    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: storageKey,
      Body: buffer,
      ContentType: ext === ".js" ? "application/javascript" : "text/x-python",
    }));

    // Create version
    const version = await prisma.engineVersion.create({
      data: {
        engineId: engine.id,
        storageKey,
        sha256,
        fileSizeBytes: buffer.length,
        language,
        validationStatus: "passed",
        validatedAt: new Date(),
      },
    });

    // Create submission
    await prisma.submission.create({
      data: {
        engineVersionId: version.id,
        submittedByUserId: seedUser.id,
        status: "validated",
      },
    });

    console.log(`  Created: ${engine.name} (${engine.id})`);
    console.log(`  Uploaded: ${storageKey}`);
    console.log(`  Version: ${version.id}\n`);
  }

  console.log("Seed import complete!");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
