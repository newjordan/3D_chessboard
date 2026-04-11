import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import { prisma, EngineStatus, ValidationStatus, SubmissionStatus, JobStatus, JobType } from "./db";
import multer from "multer";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";
import path from "path";

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// CORS: only allow configured origins
const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map(o => o.trim())
  : ["http://localhost:3000"];

app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
}));
app.use(express.json());

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many submissions, please try again later." },
});

app.use("/api/", generalLimiter);

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

const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB
const ALLOWED_EXTENSIONS = [".js", ".py"];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

const MAX_ENGINE_NAME_LENGTH = 64;

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
    console.error("Leaderboard error:", error);
    res.status(500).json({ error: "Internal server error" });
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
    console.error("Engine fetch error:", error);
    res.status(500).json({ error: "Internal server error" });
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
    console.error("Match fetch error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 4. Submit Engine
app.post("/api/engines/submit", submitLimiter, upload.single("file"), async (req, res) => {
  try {
    const { name, ownerUserId } = req.body;
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
    if (typeof name !== "string" || name.length > MAX_ENGINE_NAME_LENGTH || name.trim().length === 0) {
      return res.status(400).json({ error: `Engine name must be 1-${MAX_ENGINE_NAME_LENGTH} characters` });
    }

    // Validate ownerUserId exists
    const owner = await prisma.user.findUnique({ where: { id: ownerUserId } });
    if (!owner) {
      return res.status(400).json({ error: "Invalid owner" });
    }

    const buffer = file.buffer;
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    if (!slug) {
      return res.status(400).json({ error: "Engine name must contain alphanumeric characters" });
    }

    // Check for slug collision: if an engine with this slug exists owned by a different user, reject
    const existingEngine = await prisma.engine.findUnique({ where: { slug } });
    if (existingEngine && existingEngine.ownerUserId !== ownerUserId) {
      return res.status(409).json({ error: "An engine with a similar name already exists" });
    }

    // 1. Upsert Engine (safe now — we verified ownership above)
    const engine = await prisma.engine.upsert({
      where: { slug },
      create: {
        name: name.trim(),
        slug,
        ownerUserId,
        status: EngineStatus.pending,
      },
      update: { updatedAt: new Date() },
    });

    // 2. Upload to S3/R2
    const storageKey = `engines/${engine.id}/${sha256}${ext}`;
    const contentType = ext === ".js" ? "application/javascript" : "text/x-python";
    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: storageKey,
      Body: buffer,
      ContentType: contentType,
    }));

    // 3. Create Version
    const version = await prisma.engineVersion.create({
      data: {
        engineId: engine.id,
        storageKey,
        sha256,
        fileSizeBytes: buffer.length,
        language: ext.slice(1), // "js" or "py"
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
    res.status(500).json({ error: "Internal server error" });
  }
});

// 5. Delete Engine
app.delete("/api/engines/:id", async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId || typeof userId !== "string") {
      return res.status(400).json({ error: "Missing userId" });
    }

    const engine = await prisma.engine.findUnique({ where: { id: req.params.id } });

    if (!engine) return res.status(404).json({ error: "Engine not found" });
    if (engine.ownerUserId !== userId) return res.status(403).json({ error: "Forbidden" });

    await prisma.engine.delete({ where: { id: req.params.id } });
    console.log(`Engine deleted: ${engine.id} by user ${userId}`);
    res.json({ success: true });
  } catch (error: any) {
    console.error("Delete error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(port, () => {
  console.log(`[${new Date().toISOString()}] Backend API listening at http://localhost:${port}`);
});
