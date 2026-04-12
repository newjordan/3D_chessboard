import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import multer from "multer";
import crypto from "crypto";
import path from "path";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import rateLimit from "express-rate-limit";

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const port = process.env.PORT || 3001;

// S3/R2 Setup
const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

const BUCKET_NAME = process.env.R2_BUCKET || "chess-agents";

app.use(cors());
app.use(express.json());

// Consts
const ALLOWED_EXTENSIONS = [".js", ".py"];
const MAX_ENGINE_NAME_LENGTH = 32;

// Limiters
const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "Too many submissions. Please wait 15 minutes." }
});

// Helper: Slugify
const slugify = (text: string) => {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
};

// 1. Root
app.get("/", (req, res) => {
  res.json({ status: "ok", service: "Chess Agents API" });
});

// 2. Monitoring
app.get("/api/health", (req, res) => {
  res.json({ status: "healthy" });
});

// 3. Get All Active Engines (Leaderboard)
app.get("/api/leaderboard", async (req, res) => {
  try {
    const engines = await prisma.engine.findMany({
      where: { status: "active" },
      orderBy: { currentRating: "desc" },
      include: {
        owner: { select: { username: true, image: true } },
        _count: {
          select: {
            matchesChallenged: { where: { status: "running" } },
            matchesDefended: { where: { status: "running" } },
          },
        },
      },
    });
    res.json(engines);
  } catch (error) {
    console.error("Leaderboard error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 4. Get Recent Matches (with optional engine filtering)
app.get("/api/matches", async (req, res) => {
  try {
    const { engine: engineSlug } = req.query;
    
    const where: any = {};
    if (engineSlug && typeof engineSlug === 'string') {
      where.OR = [
        { challengerEngine: { slug: engineSlug } },
        { defenderEngine: { slug: engineSlug } }
      ];
    }

    const matches = await prisma.match.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        challengerEngine: { 
          include: { 
            owner: { select: { username: true, image: true } } 
          } 
        },
        defenderEngine: { 
          include: { 
            owner: { select: { username: true, image: true } } 
          } 
        },
      }
    });
    res.json(matches);
  } catch (error: any) {
    console.error("Matches list error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 4. Get Match PGN
app.get("/api/matches/:id/pgn", async (req, res) => {
  try {
    const match = await prisma.match.findUnique({
      where: { id: req.params.id },
      select: { pgnStorageKey: true }
    });

    if (!match || !match.pgnStorageKey) {
      return res.status(404).json({ error: "PGN not found for this match" });
    }

    try {
      const response = await s3Client.send(new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: match.pgnStorageKey,
      })) as any;

      const Body = response.Body;
      if (!Body) throw new Error("Empty response from R2");

      const pgnText = await (Body as any).transformToString();
      res.type("text/plain").send(pgnText);
    } catch (s3Error: any) {
      if (s3Error.name === "NoSuchKey") {
        return res.status(404).json({ error: "PGN file not found in storage" });
      }
      throw s3Error;
    }
  } catch (error: any) {
    console.error("PGN fetch error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 5. Get Match Details
app.get("/api/matches/:id", async (req, res) => {
  try {
    const match = await prisma.match.findUnique({
      where: { id: req.params.id },
      include: {
        challengerEngine: { include: { owner: { select: { username: true, image: true } } } },
        defenderEngine: { include: { owner: { select: { username: true, image: true } } } },
        games: { orderBy: { roundIndex: "asc" } }
      }
    });
    if (!match) return res.status(404).json({ error: "Match not found" });
    res.json(match);
  } catch (error: any) {
    console.error("Match fetch error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 6. Get Engines by Owner
app.get("/api/engines/by-owner/:userId", async (req, res) => {
  try {
    const engines = await prisma.engine.findMany({
      where: { ownerUserId: req.params.userId },
      orderBy: { createdAt: "desc" },
      include: {
        owner: { select: { username: true, image: true } },
        versions: { orderBy: { submittedAt: "desc" }, take: 1 },
        _count: {
          select: {
            matchesChallenged: { where: { status: "running" } },
            matchesDefended: { where: { status: "running" } },
          },
        },
      },
    });
    res.json(engines);
  } catch (error: any) {
    console.error("Owner engines error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 7. Get Engine Detail by Slug
app.get("/api/engines/:slug", async (req, res) => {
  try {
    const engine = await prisma.engine.findUnique({
      where: { slug: req.params.slug },
      include: {
        owner: { select: { username: true, image: true } },
        versions: { 
          orderBy: { submittedAt: "desc" },
          select: {
            id: true,
            versionLabel: true,
            storageKey: true,
            sha256: true,
            fileSizeBytes: true,
            validationStatus: true,
            validationNotes: true,
            uciName: true,
            language: true,
            submittedAt: true,
            validatedAt: true
          }
        },
        matchesChallenged: {
          take: 10,
          orderBy: { completedAt: "desc" },
          include: {
            challengerEngine: { include: { owner: { select: { username: true, image: true } } } },
            defenderEngine: { include: { owner: { select: { username: true, image: true } } } },
          }
        },
        matchesDefended: {
          take: 10,
          orderBy: { completedAt: "desc" },
          include: {
            challengerEngine: { include: { owner: { select: { username: true, image: true } } } },
            defenderEngine: { include: { owner: { select: { username: true, image: true } } } },
          }
        },
        _count: {
          select: {
            matchesChallenged: true,
            matchesDefended: true,
          }
        }
      }
    });

    if (!engine) return res.status(404).json({ error: "Agent not found" });
    res.json(engine);
  } catch (error: any) {
    console.error("Engine detail error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

const upload = multer({ storage: multer.memoryStorage() });

// 7. Submit Engine
app.post("/api/engines/submit", submitLimiter, upload.single("file"), async (req, res) => {
  try {
    const { name, ownerUserId, generationModel } = req.body;
    const file = req.file;

    if (!file || !name || !ownerUserId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Validate file type
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return res.status(400).json({ error: "Only .js and .py files are accepted" });
    }

    // Validate engine name
    if (typeof name !== "string" || name.trim().length === 0 || name.length > MAX_ENGINE_NAME_LENGTH) {
      return res.status(400).json({ error: `Engine name must be 1-${MAX_ENGINE_NAME_LENGTH} characters` });
    }

    const buffer = file.buffer;
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    const slug = slugify(name);

    // Upsert owner
    await prisma.user.upsert({
      where: { id: ownerUserId },
      create: { id: ownerUserId },
      update: {},
    });

    // 1. Quota Check: Limit 3 engines per user
    const existingEngine = await prisma.engine.findUnique({ where: { slug } });
    
    if (!existingEngine) {
      const engineCount = await prisma.engine.count({
        where: { ownerUserId }
      });

      if (engineCount >= 3) {
        return res.status(403).json({ 
          error: "Engine limit reached. You can only have 3 agents. Please delete one to submit a new bot." 
        });
      }
    }

    // 2. Plagiarism Check
    const duplicateCode = await prisma.engineVersion.findFirst({
      where: {
        sha256,
        engine: { ownerUserId: { not: ownerUserId } }
      }
    });

    if (duplicateCode) {
      return res.status(400).json({ 
        error: "Submission rejected: This exact code has already been submitted by another user." 
      });
    }

    // 3. Upsert Engine
    const engine = await prisma.engine.upsert({
      where: { slug },
      create: {
        name: name.trim(),
        slug,
        ownerUserId,
        status: "active",
      },
      update: { updatedAt: new Date() },
    });

    // 4. Create new Version
    const version = await prisma.engineVersion.create({
      data: {
        engineId: engine.id,
        storageKey: `engines/${engine.id}/${sha256}${ext}`,
        sha256,
        fileSizeBytes: buffer.length,
        language: ext.slice(1),
        generationModel: generationModel || null,
        validationStatus: "pending",
      },
    });

    // 5. Create Submission
    const submission = await prisma.submission.create({
      data: {
        engineVersionId: version.id,
        submittedByUserId: ownerUserId,
        status: "uploaded",
      },
    });

    // 6. Upload to Storage
    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: version.storageKey,
      Body: buffer,
      ContentType: ext === ".js" ? "application/javascript" : "text/x-python",
    }));

    // 7. Create Validation Job
    await prisma.job.create({
      data: {
        jobType: "submission_validate",
        payloadJson: {
          submissionId: submission.id,
          versionId: version.id,
          storageKey: version.storageKey,
        },
        status: "pending",
      },
    });

    res.json({ success: true, submissionId: submission.id });
  } catch (error: any) {
    console.error("Submission error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 8. Delete Engine (DISABLED)
app.delete("/api/engines/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query; // Verification from caller

    if (!userId) return res.status(401).json({ error: "Authentication required" });

    const engine = await prisma.engine.findUnique({
      where: { id },
      select: { ownerUserId: true }
    });

    if (!engine) return res.status(404).json({ error: "Agent not found" });
    if (engine.ownerUserId !== userId) {
      return res.status(403).json({ error: "Permission denied: Only the owner can destroy this agent." });
    }

    // Deletion cascade handled by Prisma schema (versions, match relations must be careful)
    // Actually schema has onDelete: Cascade for versions, but Matches usually we keep or soft-delete.
    // Given the request, we will perform a full delete.
    await prisma.engine.delete({ where: { id } });

    res.json({ success: true, message: "Agent decommissioned successfully." });
  } catch (error) {
    console.error("Delete engine error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(port, () => {
  console.log(`Backend API listening at http://localhost:${port}`);
});
