import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { prisma, EngineStatus, ValidationStatus, SubmissionStatus, JobStatus, JobType } from "./db";
import multer from "multer";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// S3 / R2 Configuration
const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

const BUCKET_NAME = process.env.R2_BUCKET || "chess-agents";
const upload = multer({ storage: multer.memoryStorage() });

// --- ROUTES ---

// 1. Get Leaderboard
app.get("/api/leaderboard", async (req, res) => {
  try {
    const engines = await prisma.engine.findMany({
      where: { status: EngineStatus.active },
      orderBy: [
        { currentRating: "desc" },
        { currentRank: "asc" },
      ],
      include: {
        owner: { select: { username: true } }
      }
    });
    res.json(engines);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Get Engine Details
app.get("/api/engines/:slug", async (req, res) => {
  try {
    const engine = await prisma.engine.findUnique({
      where: { slug: req.params.slug },
      include: {
        owner: { select: { username: true } },
        versions: {
          orderBy: { submittedAt: "desc" },
          take: 1
        }
      }
    });
    if (!engine) return res.status(404).json({ error: "Engine not found" });
    res.json(engine);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Get Match Details
app.get("/api/matches/:id", async (req, res) => {
  try {
    const match = await prisma.match.findUnique({
      where: { id: req.params.id },
      include: {
        challengerEngine: true,
        defenderEngine: true,
        games: { orderBy: { roundIndex: "asc" } }
      }
    });
    if (!match) return res.status(404).json({ error: "Match not found" });
    res.json(match);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Submit Engine
app.post("/api/engines/submit", upload.single("file"), async (req, res) => {
  try {
    const { name, ownerUserId } = req.body;
    const file = req.file;

    if (!file || !name || !ownerUserId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const buffer = file.buffer;
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

    // 1. Upsert Engine
    const engine = await prisma.engine.upsert({
      where: { slug },
      create: {
        name,
        slug,
        ownerUserId,
        status: EngineStatus.pending,
      },
      update: { updatedAt: new Date() },
    });

    // 2. Upload to S3/R2
    const storageKey = `engines/${engine.id}/${sha256}`;
    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: storageKey,
      Body: buffer,
      ContentType: "application/octet-stream",
    }));

    // 3. Create Version
    const version = await prisma.engineVersion.create({
      data: {
        engineId: engine.id,
        storageKey,
        sha256,
        fileSizeBytes: buffer.length,
        targetArch: "x86_64",
        validationStatus: ValidationStatus.pending,
      },
    });

    // 4. Create Submission
    const submission = await prisma.submission.create({
      data: {
        engineVersionId: version.id,
        submittedByUserId: ownerUserId,
        status: SubmissionStatus.uploaded,
      },
    });

    // 5. Create Validation Job
    await prisma.job.create({
      data: {
        jobType: JobType.submission_validate,
        payloadJson: {
          submissionId: submission.id,
          versionId: version.id,
          storageKey,
        },
        status: JobStatus.pending,
      },
    });

    res.json({ success: true, submissionId: submission.id });
  } catch (error: any) {
    console.error("Submission error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 5. Delete Engine
app.delete("/api/engines/:id", async (req, res) => {
  try {
    const { userId } = req.body; // In real life, verify this via JWT
    const engine = await prisma.engine.findUnique({ where: { id: req.params.id } });
    
    if (!engine) return res.status(404).json({ error: "Engine not found" });
    if (engine.ownerUserId !== userId) return res.status(403).json({ error: "Forbidden" });

    await prisma.engine.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`[${new Date().toISOString()}] Backend API listening at http://localhost:${port}`);
});
