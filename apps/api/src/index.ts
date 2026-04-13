import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient, Prisma } from "@prisma/client";
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

// --- ELO LOGIC ---
function getExpectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function calculateDelta(expectedScore: number, actualScore: number, totalGames: number, kFactor: number): number {
  return Math.round(kFactor * totalGames * (actualScore - expectedScore));
}

function updateRatingsForMatch(
  ratingA: number,
  ratingB: number,
  scoreA: number,
  scoreB: number,
  totalGames: number,
  kA: number = 32,
  kB: number = 32
): { deltaA: number; deltaB: number } {
  const expectedA = getExpectedScore(ratingA, ratingB);
  const expectedB = 1 - expectedA;
  const actualA = scoreA / totalGames;
  const actualB = scoreB / totalGames;
  const deltaA = calculateDelta(expectedA, actualA, totalGames, kA);
  const deltaB = calculateDelta(expectedB, actualB, totalGames, kB);
  return { deltaA, deltaB };
}

// --- NOTIFICATIONS ---
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const BASE_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

async function notifyMatchResult(match: any, deltaA: number, deltaB: number, challengerWins: number, defenderWins: number, draws: number) {
  try {
    const resultText = match.challengerScore > match.defenderScore 
      ? `🏆 **${match.challengerEngine.name}** won the match!`
      : match.defenderScore > match.challengerScore
      ? `🏆 **${match.defenderEngine.name}** won the match!`
      : "🤝 The match ended in a draw.";

    const embed = {
      title: "🏁 Match Completed",
      description: resultText,
      color: 0x2ecc71, // Green
      fields: [
        {
          name: match.challengerEngine.name,
          value: `Score: **${match.challengerScore}**\nRating: ${match.challengerEngine.currentRating + deltaA} (${deltaA > 0 ? "+" : ""}${deltaA})`,
          inline: true
        },
        {
          name: match.defenderEngine.name,
          value: `Score: **${match.defenderScore}**\nRating: ${match.defenderEngine.currentRating + deltaB} (${deltaB > 0 ? "+" : ""}${deltaB})`,
          inline: true
        },
        {
          name: "Statistics",
          value: `Wins: ${challengerWins} | Losses: ${defenderWins} | Draws: ${draws}`,
          inline: false
        }
      ],
      url: `${BASE_URL}/matches/${match.id}`,
      timestamp: new Date().toISOString(),
      footer: {
        text: `Match ID: ${match.id.substring(0, 8)}`
      }
    };

    if (!DISCORD_WEBHOOK_URL) return;

    await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });
  } catch (error) {
    console.error("Failed to send Discord notification:", error);
  }
}

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

app.get("/api/health", (req, res) => {
  res.json({ status: "healthy" });
});

// --- BROKER MIDDLEWARE ---
const authorizeBroker = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const secret = req.headers['x-broker-secret'];
  if (!secret || secret !== process.env.BROKER_SECRET) {
    console.warn(`[Broker] Unauthorized access attempt from ${req.ip}`);
    return res.status(401).json({ error: "Unauthorized broker access" });
  }
  next();
};
// Helper: Fetch engine source from R2
async function fetchEngineSource(key: string): Promise<string> {
  try {
    const response = await s3Client.send(new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    })) as any;
    
    const body = response.Body;
    if (!body) return "";
    return await body.transformToString();
  } catch (err) {
    console.error(`Failed to fetch source for ${key}:`, err);
    return "";
  }
}

// --- SOCIAL & SHOWCASE ENDPOINTS (High Priority) ---

// Get a Random Recent Match (for Showcase)
app.get("/api/matches/random", async (req, res) => {
  console.log("[API] GET /api/matches/random requested");
  try {
    const total = await prisma.match.count({ where: { status: "completed" } });
    if (total === 0) {
      console.warn("[API] No completed matches found for showcase");
      return res.status(200).json(null); // Return 200/null instead of 404
    }
    
    const recentCount = Math.min(total, 50);
    const skip = Math.floor(Math.random() * recentCount);
    
    const match = await prisma.match.findFirst({
      where: { status: "completed" },
      skip,
      include: {
        challengerEngine: { include: { owner: { select: { username: true, image: true } } } },
        defenderEngine: { include: { owner: { select: { username: true, image: true } } } },
      }
    });
    res.json(match);
  } catch (error: any) {
    console.error("Random match error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get User Profile with Aggregates
app.get("/api/users/:handle", async (req, res) => {
  console.log(`[API] GET /api/users/${req.params.handle} requested`);
  try {
    const { handle } = req.params;
    
    // 1. Case-insensitive search by username
    let user = await prisma.user.findFirst({
      where: { 
        username: {
          equals: handle,
          mode: 'insensitive'
        }
      },
      include: {
        engines: {
          orderBy: { currentRating: "desc" },
          include: {
            _count: { select: { matchesChallenged: true, matchesDefended: true } }
          }
        }
      }
    });

    // 2. Fallback to ID if not found by username
    if (!user) {
      user = await prisma.user.findUnique({
        where: { id: handle },
        include: {
          engines: {
            orderBy: { currentRating: "desc" },
            include: {
              _count: { select: { matchesChallenged: true, matchesDefended: true } }
            }
          }
        }
      });
    }

    if (!user) return res.status(404).json({ error: "Developer not found" });

    // 3. Aggregate performance across all engines for this profile
    const allMatches = await prisma.match.findMany({
      where: {
        OR: [
          { challengerEngine: { ownerUserId: user.id }, status: 'completed' },
          { defenderEngine: { ownerUserId: user.id }, status: 'completed' }
        ]
      }
    });

    let totalWins = 0;
    let totalLosses = 0;
    let totalDraws = 0;

    allMatches.forEach((match: any) => {
      const isChallenger = match.challengerEngineId ? (user?.engines.some((e: any) => e.id === match.challengerEngineId)) : false;
      const cScore = Number(match.challengerScore || 0);
      const dScore = Number(match.defenderScore || 0);

      if (cScore === dScore) {
        totalDraws++;
      } else if ((isChallenger && cScore > dScore) || (!isChallenger && dScore > cScore)) {
        totalWins++;
      } else {
        totalLosses++;
      }
    });

    res.json({
      ...user,
      stats: {
        totalWins,
        totalLosses,
        totalDraws,
        totalEarnings: 0, // Reset to zero for the first month
        peakRating: Math.max(1200, ...user.engines.map((e: any) => e.currentRating))
      }
    });
  } catch (error: any) {
    console.error("User profile error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get Recent Matches (with optional engine filtering)
app.get("/api/matches", async (req, res) => {
  console.log(`[API] GET /api/matches requested (engine=${req.query.engine})`);
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
        challengerEngine: { include: { owner: { select: { username: true, image: true } } } },
        defenderEngine: { include: { owner: { select: { username: true, image: true } } } },
      }
    });
    res.json(matches);
  } catch (error: any) {
    console.error("Matches list error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 3. Get All Active Engines (Leaderboard) — Paginated
app.get("/api/leaderboard", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
    const skip = (page - 1) * limit;

    const [engines, total] = await Promise.all([
      prisma.engine.findMany({
        where: { 
          status: "active",
          gamesPlayed: { gt: 0 } 
        },
        orderBy: { currentRating: "desc" },
        skip,
        take: limit,
        include: {
          owner: { select: { id: true, username: true, image: true } },
          _count: {
            select: {
              matchesChallenged: { where: { status: "running" } },
              matchesDefended: { where: { status: "running" } },
            },
          },
        },
      }),
      prisma.engine.count({ 
        where: { 
          status: "active",
          gamesPlayed: { gt: 0 } 
        } 
      }),
    ]);

    res.json({ engines, total, page, limit });
  } catch (error: any) {
    console.error("Leaderboard error:", error);
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
      where: { ownerUserId: req.params.userId as string },
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

// Duplicate endpoint removed

// 7. Get Engine Detail by Slug
app.get("/api/engines/:slug", async (req, res) => {
  try {
    const engine = await prisma.engine.findUnique({
      where: { slug: req.params.slug as string },
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
        ratings: {
          take: 100,
          orderBy: { createdAt: "asc" },
          select: {
            ratingAfter: true,
            createdAt: true
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
    const { name, ownerUserId, ownerUsername, ownerName, ownerEmail, ownerImage, generationModel } = req.body;
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
    const { engineId } = req.body;

    // 0. Resolve/Sync User
    await prisma.user.upsert({
      where: { id: ownerUserId },
      create: { 
        id: ownerUserId,
        username: ownerUsername || null,
        name: ownerName || null,
        email: ownerEmail || null,
        image: ownerImage || null,
      },
      update: {
        username: ownerUsername || undefined,
        name: ownerName || undefined,
        email: ownerEmail || undefined,
        image: ownerImage || undefined,
      },
    });

    // 0.1 Plagiarism Check
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

    // 1. Resolve Engine
    let engine;
    if (engineId) {
      // UPGRADE FLOW
      engine = await prisma.engine.findUnique({ where: { id: engineId } });
      if (!engine) return res.status(404).json({ error: "Engine not found" });
      if (engine.ownerUserId !== ownerUserId) {
        return res.status(403).json({ error: "You do not have permission to update this engine" });
      }
      
      // Update engine timestamp
      await prisma.engine.update({
        where: { id: engineId },
        data: { updatedAt: new Date() }
      });
    } else {
      // NEW ENGINE FLOW
      const slug = slugify(name);
      
      // Check if this engine slug already exists
      const existingEngine = await prisma.engine.findUnique({ where: { slug } });
      if (existingEngine) {
        return res.status(400).json({ 
          error: "An engine with this name already exists. If you own it, please use the update flow." 
        });
      }

      engine = await prisma.engine.create({
        data: {
          name: name.trim(),
          slug,
          ownerUserId,
          status: "active",
        },
      });
    }

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

    res.json({ success: true, submissionId: submission.id, engineSlug: engine.slug, versionId: version.id });
  } catch (error: any) {
    console.error("Submission error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 8. Get Submission Status (for polling)
app.get("/api/submissions/:id", async (req, res) => {
  try {
    const submission = await prisma.submission.findUnique({
      where: { id: req.params.id },
      include: {
        version: {
          select: {
            validationStatus: true,
            validationNotes: true,
            uciName: true,
            uciAuthor: true,
            validatedAt: true,
          },
        },
      },
    });

    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    res.json(submission);
  } catch (error: any) {
    console.error("Submission status error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 9. Upload Engine Assets (Avatar/Piece)
app.post("/api/engines/:id/assets", upload.fields([{ name: "avatar", maxCount: 1 }, { name: "piece", maxCount: 1 }]), async (req: any, res: any) => {
  try {
    const engineId = req.params.id as string;
    const { userId } = req.body;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    if (!userId) return res.status(401).json({ error: "Authentication required" });

    const engine = await prisma.engine.findUnique({ where: { id: engineId } });
    if (!engine) return res.status(404).json({ error: "Agent not found" });
    if (engine.ownerUserId !== userId) return res.status(403).json({ error: "Permission denied" });

    const updates: any = {};

    if (files.avatar && files.avatar[0]) {
      const file = files.avatar[0];
      const ext = path.extname(file.originalname).toLowerCase();
      const key = `assets/engines/${engineId}/avatar${ext}`;
      await s3Client.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }));
      updates.avatarUrl = `/api/assets/${engineId}/avatar?v=${Date.now()}`;
    }

    if (files.piece && files.piece[0]) {
      const file = files.piece[0];
      const ext = path.extname(file.originalname).toLowerCase();
      const key = `assets/engines/${engineId}/piece${ext}`;
      await s3Client.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }));
      updates.pieceUrl = `/api/assets/${engineId}/piece?v=${Date.now()}`;
    }

    if (Object.keys(updates).length > 0) {
      await prisma.engine.update({
        where: { id: engineId },
        data: updates,
      });
    }

    res.json({ success: true, ...updates });
  } catch (error: any) {
    console.error("Asset upload error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 10. Serve Engine Assets (Proxy)
app.get("/api/assets/:engineId/:type", async (req, res) => {
  try {
    const engineId = req.params.engineId as string;
    const type = req.params.type as string;
    if (type !== 'avatar' && type !== 'piece') return res.status(400).json({ error: "Invalid asset type" });

    const engine = await prisma.engine.findUnique({ 
      where: { id: engineId },
      select: { id: true, avatarUrl: true, pieceUrl: true }
    });

    if (!engine) return res.status(404).json({ error: "Agent not found" });

    // We need to find the correct extension by listing or by trial/error, 
    // but better to just use a fixed key pattern or check the DB if we stored the full key.
    // For now, let's try common extensions if we don't store the exact key in DB.
    // Actually, I should probably have stored the exact storageKey in DB.
    // Let's refine: I'll try to find the object in S3.
    
    // Simplification: Let's assume common extensions or just use the one that exists.
    const extensions = ['.png', '.jpg', '.jpeg', '.webp', '.svg'];
    let foundObject: any = null;
    let foundExt = '';

    for (const ext of extensions) {
      try {
        const key = `assets/engines/${engineId}/${type}${ext}`;
        const response = await s3Client.send(new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
        }));
        foundObject = response;
        foundExt = ext;
        break;
      } catch (e: any) {}
    }

    if (!foundObject) return res.status(404).json({ error: "Asset not found" });

    res.setHeader("Content-Type", foundObject.ContentType || "image/png");
    res.setHeader("Cache-Control", "public, max-age=3600"); // 1 hour cache
    (foundObject.Body as any).pipe(res);
  } catch (error: any) {
    console.error("Asset serve error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 8. Delete Engine (DISABLED)
app.delete("/api/engines/:id", async (req, res) => {
  try {
    const id = req.params.id as string;
    const { userId } = req.query; // Verification from caller

    if (!userId) return res.status(401).json({ error: "Authentication required" });

    const engine = await prisma.engine.findFirst({
      where: {
        OR: [
          { id },
          { slug: id }
        ]
      },
      include: {
        versions: {
          take: 1,
          orderBy: { submittedAt: 'desc' },
          select: { validationStatus: true }
        }
      }
    });

    if (!engine) return res.status(404).json({ error: "Agent not found" });
    if (engine.ownerUserId !== userId) {
      return res.status(403).json({ error: "Permission denied: Only the owner can destroy this agent." });
    }

    const latestStatus = engine.versions[0]?.validationStatus;
    const canDelete = !latestStatus || ['failed', 'pending', 'running'].includes(latestStatus);
    
    if (!canDelete) {
      return res.status(400).json({ error: "Decommissioning blocked: You can only delete agents that are pending or have failed builds." });
    }

    // Check for match history which would block hard-deletion
    const matchCount = await prisma.match.count({
      where: {
        OR: [
          { challengerEngineId: engine.id },
          { defenderEngineId: engine.id }
        ]
      }
    });

    if (matchCount > 0) {
      return res.status(400).json({ error: "Cannot delete agent because it has existing match history in the ladder. Agents with history should be disabled instead." });
    }

    await prisma.engine.delete({ where: { id: engine.id } });

    res.json({ success: true, message: "Agent decommissioned successfully." });
  } catch (error: any) {
    console.error("Delete engine error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- MATCH BROKER API ---

// 1. Fetch Next Jobs (Batch)
app.post("/api/broker/next-jobs", authorizeBroker, async (req, res) => {
  const count = Math.min(10, Math.max(1, req.body.count || 1));
  const brokerId = `broker-${req.body.brokerId || 'external'}`;
  
  console.log(`[Broker] ${brokerId} requesting ${count} jobs`);

  try {
    const jobs = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Find pending match_run jobs using the same logic as workers
      const pendingJobs = (await tx.$queryRawUnsafe(`
        SELECT id FROM "Job"
        WHERE status = 'pending' AND "runAt" <= NOW() AND "jobType" = 'match_run'
        ORDER BY "runAt" ASC
        LIMIT ${count}
        FOR UPDATE SKIP LOCKED
      `)) as any[];

      if (!pendingJobs || pendingJobs.length === 0) return [];

      const jobIds = pendingJobs.map((j: { id: string }) => j.id);

      // Mark them as processing
      await tx.job.updateMany({
        where: { id: { in: jobIds } },
        data: {
          status: 'processing' as any,
          workerId: brokerId,
          lockedAt: new Date(),
          attempts: { increment: 1 }
        }
      });

      return await tx.job.findMany({
        where: { id: { in: jobIds } }
      });
    });

    if (jobs.length === 0) return res.json([]);

    // Hydrate jobs with match data and source code
    const packages = await Promise.all(jobs.map(async (job: any) => {
      const { matchId } = job.payloadJson as { matchId: string };
      
      const match = await prisma.match.findUnique({
        where: { id: matchId },
        include: {
          challengerVersion: true,
          defenderVersion: true,
          challengerEngine: true,
          defenderEngine: true,
        }
      });

      if (!match) return null;

      // Extract raw code for the broker
      const [challengerCode, defenderCode] = await Promise.all([
        fetchEngineSource(match.challengerVersion.storageKey),
        fetchEngineSource(match.defenderVersion.storageKey)
      ]);

      return {
        jobId: job.id,
        matchId: match.id,
        matchType: match.matchType,
        timeControl: match.timeControl,
        gamesPlanned: match.gamesPlanned,
        challenger: {
          id: match.challengerEngineId,
          name: match.challengerEngine.name,
          language: match.challengerVersion.language,
          code: challengerCode
        },
        defender: {
          id: match.defenderEngineId,
          name: match.defenderEngine.name,
          language: match.defenderVersion.language,
          code: defenderCode
        }
      };
    }));

    res.json(packages.filter(p => p !== null));
  } catch (error) {
    console.error("Broker fetch error:", error);
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
});

// 2. Submit Match Result
app.post("/api/broker/submit", authorizeBroker, async (req, res) => {
  const { jobId, matchId, pgn, result, challengerScore, defenderScore } = req.body;
  console.log(`[Broker] Submission received for match ${matchId} (Job: ${jobId})`);

  if (!matchId || !pgn || !result) {
    console.error(`[Broker] Malformed submission for match ${matchId}. Missing required fields.`);
    return res.status(400).json({ error: "Missing required submission fields" });
  }

  try {
    const match = await prisma.match.findUnique({ 
      where: { id: matchId },
      include: { challengerEngine: true, defenderEngine: true }
    });
    if (!match) return res.status(404).json({ error: "Match not found" });

    // --- Validation Logic ---
    const getTag = (pgn: string, tag: string) => {
      const regex = new RegExp(`\\[${tag} "(.*?)"\\]`);
      const m = pgn.match(regex);
      return m ? m[1] : null;
    };

    const pgnWhite = getTag(pgn, "White");
    const pgnBlack = getTag(pgn, "Black");
    const resultsCount = (pgn.match(/^\[Result "(.*?)"\]/gm) || []).length;

    const challengerName = match.challengerEngine.name;
    const defenderName = match.defenderEngine.name;

    // Check 1: Identity (Self-Play detection)
    if (pgnWhite === pgnBlack) {
      return res.status(400).json({
        error: "Validation Failed",
        details: `PGN shows '${pgnWhite}' playing against itself. Expected '${challengerName}' vs '${defenderName}'.`,
        suggestion: "Ensure your engine runner is correctly passing different names to the White and Black slots."
      });
    }

    // Check 2: Player Matching
    const names = [pgnWhite?.toLowerCase(), pgnBlack?.toLowerCase()];
    if (!names.includes(challengerName.toLowerCase()) || !names.includes(defenderName.toLowerCase())) {
      return res.status(400).json({
        error: "Validation Failed",
        details: `PGN Player names ('${pgnWhite}' vs '${pgnBlack}') do not match expected engines ('${challengerName}' vs '${defenderName}').`,
        suggestion: "Verify that the PGN headers match the engine names provided in the job package."
      });
    }

    // Check 3: Round Count
    if (resultsCount !== match.gamesPlanned) {
      return res.status(400).json({
        error: "Validation Failed",
        details: `PGN contains ${resultsCount} games, but match was configured for ${match.gamesPlanned} games.`,
        suggestion: "Check if your runner is accidentally duplicating rounds or failing to finish them."
      });
    }

    // Store PGN
    const pgnKey = `matches/${matchId}/match.pgn`;
    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: pgnKey,
      Body: pgn,
      ContentType: "application/x-chess-pgn",
    }));

    // --- RE-IMPLEMENTING RATING LOGIC FROM WORKER ---
    const getKFactor = (engine: any) => {
      if (engine.gamesPlayed < 30) return 40;
      if (engine.currentRating > 2400) return 16;
      return 32;
    };

    const kA = getKFactor(match.challengerEngine);
    const kB = getKFactor(match.defenderEngine);

    const { deltaA, deltaB } = updateRatingsForMatch(
       match.challengerEngine.currentRating,
       match.defenderEngine.currentRating,
       Number(challengerScore),
       Number(defenderScore),
       match.gamesPlanned,
       kA,
       kB
    );

    // Parse PGN to reconstruct individual games for DB
    // Format: [Round "1"] [White "EngineA"] [Black "EngineB"] [Result "1-0"]
    const rounds = pgn.split(/\[Event /).filter((r: string) => r.trim().length > 0);
    const gameSubmissions = rounds.map((r: string, i: number) => {
      const getGameTag = (text: string, tag: string) => {
        const regex = new RegExp(`\\[${tag} "(.*?)"\\]`);
        const m = text.match(regex);
        return m ? m[1] : null;
      };

      const white = getGameTag(r, "White");
      const black = getGameTag(r, "Black");
      const res = getGameTag(r, "Result");
      const termination = getGameTag(r, "Termination") || "Adjudication";

      return {
        matchId: match.id,
        roundIndex: i + 1,
        whiteEngineId: white?.toLowerCase() === challengerName.toLowerCase() ? match.challengerEngineId : match.defenderEngineId,
        blackEngineId: white?.toLowerCase() === challengerName.toLowerCase() ? match.defenderEngineId : match.challengerEngineId,
        result: res || "*",
        termination,
        pgnStorageKey: "" // Sub-PGNs not stored individually yet
      };
    });

    // Calculate detailed stats
    let challengerWins = 0;
    let defenderWins = 0;
    let draws = 0;

    gameSubmissions.forEach((g: any) => {
      if (g.result === "1-0") {
        if (g.whiteEngineId === match.challengerEngineId) challengerWins++;
        else defenderWins++;
      } else if (g.result === "0-1") {
        if (g.blackEngineId === match.challengerEngineId) challengerWins++;
        else defenderWins++;
      } else if (g.result === "1/2-1/2") {
        draws++;
      }
    });
    
    // Determine winnerEngineId
    let winnerEngineId = null;
    if (Number(challengerScore) > Number(defenderScore)) {
      winnerEngineId = match.challengerEngineId;
    } else if (Number(defenderScore) > Number(challengerScore)) {
      winnerEngineId = match.defenderEngineId;
    }

    // Atomically update Match, Engines, Ratings, and Games
    await prisma.$transaction([
      prisma.match.update({
        where: { id: matchId },
        data: {
          status: 'completed' as any,
          completedAt: new Date(),
          challengerScore: challengerScore,
          defenderScore: defenderScore,
          gamesCompleted: gameSubmissions.length,
          winnerEngineId,
          pgnStorageKey: pgnKey
        }
      }),
      prisma.job.update({
        where: { id: jobId },
        data: { status: 'completed' as any, updatedAt: new Date() }
      }),
      prisma.engine.update({
        where: { id: match.challengerEngineId },
        data: {
          currentRating: { increment: deltaA },
          gamesPlayed: { increment: match.gamesPlanned },
          wins: { increment: challengerWins },
          losses: { increment: defenderWins },
          draws: { increment: draws },
          updatedAt: new Date(),
        }
      }),
      prisma.engine.update({
        where: { id: match.defenderEngineId },
        data: {
          currentRating: { increment: deltaB },
          gamesPlayed: { increment: match.gamesPlanned },
          wins: { increment: defenderWins },
          losses: { increment: challengerWins },
          draws: { increment: draws },
          updatedAt: new Date(),
        }
      }),
      prisma.rating.create({
        data: {
          engineId: match.challengerEngineId,
          matchId: match.id,
          ratingBefore: match.challengerEngine.currentRating,
          ratingAfter: match.challengerEngine.currentRating + deltaA,
          delta: deltaA,
        }
      }),
      prisma.rating.create({
        data: {
          engineId: match.defenderEngineId,
          matchId: match.id,
          ratingBefore: match.defenderEngine.currentRating,
          ratingAfter: match.defenderEngine.currentRating + deltaB,
          delta: deltaB,
        }
      }),
      ...gameSubmissions.map((g: any) => prisma.game.create({ data: g }))
    ]);

    // Update global ranks asynchronously
    prisma.$executeRawUnsafe(`
      UPDATE "Engine" e
      SET "currentRank" = ranked.rank
      FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY "currentRating" DESC) as rank
        FROM "Engine"
        WHERE status = 'active'
      ) ranked
      WHERE e.id = ranked.id
    `).catch(err => console.error("Failed to update global ranks:", err));

    console.log(`[Broker] Successfully processed result for match ${matchId}. Winner recorded.`);

    // 🔥 Fire the Webhook!
    const notifiedMatch = {
      ...match,
      challengerScore: Number(challengerScore),
      defenderScore: Number(defenderScore)
    };
    await notifyMatchResult(notifiedMatch, deltaA, deltaB, challengerWins, defenderWins, draws);

    res.json({ success: true });
  } catch (error) {
    console.error("Broker submit error:", error);
    res.status(500).json({ error: "Failed to submit result" });
  }
});

app.listen(port, () => {
  console.log(`Backend API listening at http://localhost:${port}`);
});
