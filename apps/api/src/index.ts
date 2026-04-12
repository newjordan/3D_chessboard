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
  } catch (error) {
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

    // SUM UP Formal Payouts
    const payoutsAgg = await prisma.payout.aggregate({
      where: { userId: user.id },
      _sum: { amount: true }
    });

    const profile = {
      ...user,
      stats: {
        totalWins,
        totalLosses,
        totalDraws,
        totalEarnings: Number(payoutsAgg._sum.amount || 0),
        peakRating: Math.max(1200, ...user.engines.map((e: any) => e.currentRating))
      }
    };

    res.json(profile);
  } catch (error) {
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
    if (latestStatus !== 'failed') {
      return res.status(400).json({ error: "Decommissioning blocked: You can only delete agents with failed builds." });
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

// =============================================
// ADMIN API ENDPOINTS
// =============================================
const ADMIN_API_SECRET = process.env.ADMIN_API_SECRET || "chess-agents-admin-secret-change-me";

const requireAdmin = (req: any, res: any): boolean => {
  const secret = req.headers['x-admin-secret'];
  if (!secret || secret !== ADMIN_API_SECRET) {
    res.status(403).json({ error: "Forbidden: Invalid admin credentials" });
    return false;
  }
  return true;
};

// Admin: Platform Stats Overview
app.get("/api/admin/stats", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const [
      totalUsers, totalEngines, totalMatches, totalGames, totalJobs,
      activeEngines, pendingJobs, failedJobs, runningMatches,
      recentUsers, recentMatches, matchesByDay
    ] = await Promise.all([
      prisma.user.count(),
      prisma.engine.count(),
      prisma.match.count(),
      prisma.game.count(),
      prisma.job.count(),
      prisma.engine.count({ where: { status: "active" } }),
      prisma.job.count({ where: { status: "pending" } }),
      prisma.job.count({ where: { status: "failed" } }),
      prisma.match.count({ where: { status: "running" } }),
      prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 5, select: { id: true, username: true, image: true, createdAt: true } }),
      prisma.match.findMany({
        orderBy: { createdAt: "desc" }, take: 10,
        include: {
          challengerEngine: { select: { name: true, slug: true } },
          defenderEngine: { select: { name: true, slug: true } },
        }
      }),
      // Matches created in the last 7 days
      prisma.match.findMany({
        where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
        select: { createdAt: true },
        orderBy: { createdAt: "asc" }
      })

    ]);

    // Engine status distribution
    const enginesByStatus = await prisma.engine.groupBy({
      by: ['status'],
      _count: { _all: true }
    });

    // Top rated engines
    const topEngines = await prisma.engine.findMany({
      orderBy: { currentRating: "desc" },
      take: 5,
      include: { owner: { select: { username: true } } }
    });

    // Group matches by date for the activity chart
    const matchActivityMap: Record<string, number> = {};
    (matchesByDay as any[]).forEach((m: any) => {
      const date = new Date(m.createdAt).toISOString().split('T')[0];
      matchActivityMap[date] = (matchActivityMap[date] || 0) + 1;
    });
    const matchActivity = Object.entries(matchActivityMap).map(([date, count]) => ({ date, count }));

    res.json({
      overview: {
        totalUsers, totalEngines, totalMatches, totalGames, totalJobs,
        activeEngines, pendingJobs, failedJobs, runningMatches,
      },
      enginesByStatus: enginesByStatus.map((s: any) => ({ status: s.status, count: s._count._all })),
      topEngines,
      recentUsers,
      recentMatches,
      matchesByDay: matchActivity,
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin: List All Users
app.get("/api/admin/users", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { engines: true, submissions: true } }
      }
    });
    res.json(users);
  } catch (error) {
    console.error("Admin users error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin: List All Engines
app.get("/api/admin/engines", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const engines = await prisma.engine.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        owner: { select: { username: true, image: true } },
        versions: { orderBy: { submittedAt: "desc" }, take: 1, select: { validationStatus: true, language: true, sha256: true } },
        _count: { select: { matchesChallenged: true, matchesDefended: true } }
      }
    });
    res.json(engines);
  } catch (error) {
    console.error("Admin engines error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin: Update Engine Status
app.patch("/api/admin/engines/:id", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { id } = req.params;
    const { status } = req.body;
    const validStatuses = ['pending', 'active', 'rejected', 'banned', 'disabled', 'disabled_by_owner'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }
    const engine = await prisma.engine.update({
      where: { id },
      data: { status }
    });
    res.json(engine);
  } catch (error) {
    console.error("Admin engine update error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin: Delete Engine (force)
app.delete("/api/admin/engines/:id", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    await prisma.engine.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    console.error("Admin engine delete error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 11. Admin Match Management
app.get("/api/admin/matches", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const matches = await prisma.match.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        challengerEngine: { select: { name: true } },
        defenderEngine: { select: { name: true } },
      }
    });
    res.json(matches);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.patch("/api/admin/matches/:id/status", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { status } = req.body;
    const match = await prisma.match.update({
      where: { id: req.params.id },
      data: { status: status as any }
    });
    res.json(match);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/admin/matches/:id/retry", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const match = await prisma.match.update({
      where: { id: req.params.id },
      data: { 
        status: "queued",
        gamesCompleted: 0,
        challengerScore: null,
        defenderScore: null,
        winnerEngineId: null,
        pgnStorageKey: null,
        startedAt: null,
        completedAt: null
      }
    });

    // Also re-queue the job if it exists and was failed
    await prisma.job.updateMany({
      where: { 
        jobType: "match_run", 
        payloadJson: { path: ["matchId"], equals: req.params.id }
      },
      data: { status: "pending", attempts: 0, lastError: null }
    });

    res.json(match);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// 12. Advanced Stats (ELO Distribution)
app.get("/api/admin/stats/advanced", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const engines = await prisma.engine.findMany({
      select: { currentRating: true }
    });

    // Create buckets of 100 ELO (800, 900, 1000, ...)
    const buckets: Record<number, number> = {};
    engines.forEach(e => {
      const bucket = Math.floor(e.currentRating / 100) * 100;
      buckets[bucket] = (buckets[bucket] || 0) + 1;
    });

    // Win/Loss global ratio
    const matchStats = await prisma.match.groupBy({
      by: ['status'],
      _count: true
    });

    res.json({ eloDistribution: buckets, matchSummary: matchStats });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin: List Jobs
app.get("/api/admin/jobs", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const jobs = await prisma.job.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json(jobs);
  } catch (error) {
    console.error("Admin jobs error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin: Retry Failed Job
app.patch("/api/admin/jobs/:id/retry", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const job = await prisma.job.update({
      where: { id: req.params.id },
      data: { status: "pending", attempts: 0, lastError: null, lockedAt: null, workerId: null }
    });
    res.json(job);
  } catch (error) {
    console.error("Admin job retry error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(port, () => {
  console.log(`Backend API listening at http://localhost:${port}`);
});
