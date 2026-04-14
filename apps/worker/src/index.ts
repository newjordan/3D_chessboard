import dotenv from "dotenv";
dotenv.config();

import { prisma, JobStatus, JobType, EngineStatus, ValidationStatus, SubmissionStatus, MatchStatus } from "./db";
import { storage, BUCKET_NAME } from "./storage";
import { validateFileType } from "./validation/filetype";
import { analyzeStatic } from "./validation/StaticAnalyzer";
import { probeAgent } from "./validation/probe";
import { preparePlacementMatches } from "./matchmaking/placement";
import { scheduleMatches, reapStaleJobs } from "./matchmaking/scheduler";
import { runMatch } from "./matchmaking/runner";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { updateRatingsForMatch } from "./ratings/elo";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { Readable } from "stream";
import { notifyMatchStarted, notifyMatchResult, notifyEngineValidated, notifyGameResult } from "./notifications";

const WORKER_ID = `worker-${process.env.HOSTNAME || Math.random().toString(36).substring(7)}`;

async function pollJobs() {
  try {
    const job = await prisma.$transaction(async (tx) => {
      const matchExclusion = process.env.ENABLE_MATCH_RUN === 'true' ? '' : 'AND "jobType" != \'match_run\'';

      const pendingJobs = await tx.$queryRawUnsafe<any[]>(`
        SELECT id FROM "Job"
        WHERE status = 'pending' AND "runAt" <= NOW()
        ${matchExclusion}
        ORDER BY 
          CASE 
            WHEN "jobType" = 'rating_apply' THEN 0
            WHEN "jobType" = 'submission_validate' THEN 1
            ELSE 2 
          END ASC, 
          "runAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `);

      if (!pendingJobs || pendingJobs.length === 0) return null;

      const jobId = pendingJobs[0].id;

      return await tx.job.update({
        where: { id: jobId },
        data: {
          status: JobStatus.processing,
          lockedAt: new Date(),
          workerId: WORKER_ID,
          attempts: { increment: 1 },
        },
      });
    });

    if (job) {
      console.log(`[${new Date().toISOString()}] Processing job: ${job.jobType} (${job.id})`);

      try {
        await processJob(job);

        await prisma.job.update({
          where: { id: job.id },
          data: { status: JobStatus.completed, updatedAt: new Date() },
        });
      } catch (error: any) {
        console.error(`[${new Date().toISOString()}] Job failed: ${job.id}`, error);
        await prisma.job.update({
          where: { id: job.id },
          data: {
            status: JobStatus.failed,
            lastError: error.message || String(error),
            updatedAt: new Date()
          },
        });
      }
    }
  } catch (error) {
    console.error("Error in polling loop:", error);
  }

  setTimeout(pollJobs, 2000);
}

const SCHEDULER_INTERVAL_MS = 30_000;

async function pollScheduler() {
  try {
    const scheduled = await scheduleMatches();
    if (scheduled > 0) {
      console.log(`[${new Date().toISOString()}] Scheduler queued ${scheduled} new match(es)`);
    }
  } catch (error) {
    console.error("Scheduler error:", error);
  }

  setTimeout(pollScheduler, SCHEDULER_INTERVAL_MS);
}

const REAPER_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

async function pollReaper() {
  try {
    const reapedCount = await reapStaleJobs();
    if (reapedCount > 0) {
      console.log(`[${new Date().toISOString()}] Reaper identified and recovered ${reapedCount} stale job(s).`);
    }
  } catch (error) {
    console.error("Reaper error:", error);
  }

  setTimeout(pollReaper, REAPER_INTERVAL_MS);
}

async function processJob(job: any) {
  switch (job.jobType) {
    case JobType.submission_validate:
      await handleValidation(job.payloadJson);
      break;
    case JobType.placement_prepare:
      await handlePlacementPrepare(job.payloadJson);
      break;
    case JobType.match_run:
      await handleMatchRun(job.payloadJson);
      break;
    case JobType.rating_apply:
      await handleRatingApply(job.payloadJson);
      break;
    default:
      console.log(`Skipping job type: ${job.jobType}`);
  }
}

async function handleValidation(payload: any) {
  const { submissionId, versionId, storageKey } = payload;

  // 1. Validate file type from storage key
  const fileType = validateFileType(storageKey);
  if (!fileType.isValid || !fileType.language) {
    await failSubmission(submissionId, versionId, fileType.error || "Invalid file type");
    return;
  }

  const ext = fileType.language;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "engine-"));
  const tempPath = path.join(tempDir, `agent.${ext}`);

  try {
    // 2. Download from R2
    console.log(`Downloading ${storageKey} to ${tempPath}...`);
    const { Body } = await storage.send(new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: storageKey,
    }));

    if (!Body) throw new Error("Empty response from R2");

    const arrayBuffer = await (Body as any).transformToByteArray();
    await fs.writeFile(tempPath, Buffer.from(arrayBuffer));

    // 3. Static Analysis — Check for forbidden modules/keywords
    console.log(`Analyzing code (${ext})...`);
    const analysisResult = await analyzeStatic(tempPath, ext);
    if (!analysisResult.isValid) {
      await failSubmission(submissionId, versionId, analysisResult.error || "Security violation detected");
      return;
    }

    // 4. Probe agent — send FEN, expect legal move
    console.log(`Running FEN probe (${ext})...`);
    const probeResult = await probeAgent(tempPath, ext);
    if (!probeResult.isValid) {
      await failSubmission(submissionId, versionId, probeResult.error || "Agent did not return a valid move");
      return;
    }

    // 5. Success! Update DB
    console.log(`Validation passed for ${storageKey}`);

    const version = await prisma.engineVersion.findUnique({ 
      where: { id: versionId },
      include: { engine: true }
    });
    if (!version) return;

    const ownerUserId = version.engine.ownerUserId;
    const activeCount = await prisma.engine.count({
      where: { ownerUserId, status: EngineStatus.active }
    });

    const shouldActivate = activeCount < 5;
    const targetStatus = shouldActivate ? EngineStatus.active : EngineStatus.disabled_by_owner;

    await prisma.$transaction([
      prisma.engineVersion.update({
        where: { id: versionId },
        data: {
          validationStatus: ValidationStatus.passed,
          validatedAt: new Date(),
        },
      }),
      prisma.submission.update({
        where: { id: submissionId },
        data: { status: SubmissionStatus.validated },
      }),
      prisma.engine.update({
        where: { id: version.engineId },
        data: { status: targetStatus },
      }),
      ...(shouldActivate ? [
        prisma.job.create({
          data: {
            jobType: JobType.placement_prepare,
            payloadJson: { submissionId, versionId },
            status: JobStatus.pending,
          },
        })
      ] : []),
    ]);

    // Send notification for new engine join
    try {
      const engineWithUser = await prisma.engine.findUnique({
        where: { id: (await prisma.engineVersion.findUnique({ where: { id: versionId } }))?.engineId },
        include: { owner: true }
      });
      if (engineWithUser) {
        await notifyEngineValidated(engineWithUser, engineWithUser.owner);
      }
    } catch (err) {
      console.error("Failed to fetch engine info for notification:", err);
    }
  } finally {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (e) {
      console.error("Cleanup error:", e);
    }
  }
}

async function handlePlacementPrepare(payload: any) {
  const { versionId } = payload;
  await preparePlacementMatches(versionId);
}

async function handleMatchRun(payload: any) {
  const { matchId } = payload;

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      challengerVersion: true,
      defenderVersion: true,
      challengerEngine: true,
      defenderEngine: true,
    }
  });

  if (!match) throw new Error("Match not found");

  // Send notification for match starting
  await notifyMatchStarted(match);

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "match-"));

  // Determine file extensions from storage keys
  const challengerExt = path.extname(match.challengerVersion.storageKey) || `.${match.challengerVersion.language}`;
  const defenderExt = path.extname(match.defenderVersion.storageKey) || `.${match.defenderVersion.language}`;
  const pathA = path.join(tempDir, `agent_a${challengerExt}`);
  const pathB = path.join(tempDir, `agent_b${defenderExt}`);

  try {
    // Set match to running status so it shows up in UI
    await prisma.match.update({
      where: { id: matchId },
      data: { 
        status: MatchStatus.running,
        processedBy: WORKER_ID
      }
    });

    // 1. Download agents
    console.log(`Downloading agents for match ${matchId}...`);
    await downloadAgent(match.challengerVersion.storageKey, pathA);
    await downloadAgent(match.defenderVersion.storageKey, pathB);

    // 2. Run match
    const result = await runMatch(
      {
        path: pathA,
        language: (match.challengerVersion.language || challengerExt.slice(1)) as "js" | "py",
        name: match.challengerEngine.name,
      },
      {
        path: pathB,
        language: (match.defenderVersion.language || defenderExt.slice(1)) as "js" | "py",
        name: match.defenderEngine.name,
      },
      { 
        games: match.gamesPlanned,
        onGameComplete: async (round, res, term) => {
          await notifyGameResult(match, round, res, term);
        }
      }
    );

    // 3. Validate score integrity
    let challengerWins = 0;
    let defenderWins = 0;
    let draws = 0;
    
    for (const g of result.games) {
      const isChallengerWhite = g.round % 2 !== 0;
      if (g.result === "1-0") {
        if (isChallengerWhite) challengerWins++;
        else defenderWins++;
      } else if (g.result === "0-1") {
        if (!isChallengerWhite) challengerWins++;
        else defenderWins++;
      } else if (g.result === "1/2-1/2") {
        draws++;
      }
    }

    const totalGames = challengerWins + defenderWins + draws;

    if (totalGames !== match.gamesPlanned) {
      throw new Error(`Score integrity check failed: ${totalGames} counted vs ${match.gamesPlanned} expected`);
    }

    const challengerScore = challengerWins + (draws * 0.5);
    const defenderScore = defenderWins + (draws * 0.5);

    // 4. Save PGN to R2
    const pgnKey = `matches/${matchId}/match.pgn`;
    await storage.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: pgnKey,
      Body: result.pgn,
      ContentType: "application/x-chess-pgn",
    }));

    // Determine winnerEngineId
    let winnerEngineId = null;
    if (challengerScore > defenderScore) {
      winnerEngineId = match.challengerEngineId;
    } else if (defenderScore > challengerScore) {
      winnerEngineId = match.defenderEngineId;
    }

    // 5. Update Match results
    await prisma.$transaction([
      prisma.match.update({
        where: { id: matchId },
        data: {
          status: "completed",
          completedAt: new Date(),
          challengerScore,
          defenderScore,
          gamesCompleted: totalGames,
          winnerEngineId,
          pgnStorageKey: pgnKey,
          processedBy: WORKER_ID
        }
      }),
      ...result.games.map(g => {
        const isChallengerWhite = g.round % 2 !== 0; // Odd rounds: Challenger is White
        return prisma.game.create({
          data: {
            matchId,
            roundIndex: g.round,
            whiteEngineId: isChallengerWhite ? match.challengerEngineId : match.defenderEngineId,
            blackEngineId: isChallengerWhite ? match.defenderEngineId : match.challengerEngineId,
            result: g.result,
            termination: g.termination,
            pgnStorageKey: "",
          }
        });
      }),
      prisma.job.create({
        data: {
          jobType: JobType.rating_apply,
          payloadJson: { matchId },
          status: JobStatus.pending,
        }
      })
    ]);

  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function handleRatingApply(payload: any) {
  const { matchId } = payload;
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      challengerEngine: true,
      defenderEngine: true,
    }
  });

  if (!match || match.status !== "completed") return;

  // Idempotency check
  const existingRating = await prisma.rating.findFirst({ where: { matchId } });
  if (existingRating) {
    console.log(`Ratings already applied for match ${matchId}, skipping`);
    return;
  }

  // Dynamic K-Factor Logic
  // - New engines (< 30 games): K=40 (Placement boost)
  // - Established masters (> 2400): K=16 (Stability)
  // - Default: K=32
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
    Number(match.challengerScore || 0),
    Number(match.defenderScore || 0),
    match.gamesPlanned,
    kA,
    kB
  );

  // Calculate detailed stats from individual games
  const games = await prisma.game.findMany({ where: { matchId } });

  let challengerWins = 0;
  let defenderWins = 0;
  let draws = 0;

  for (const game of games) {
    if (game.result === "1-0") {
      if (game.whiteEngineId === match.challengerEngineId) challengerWins++;
      else defenderWins++;
    } else if (game.result === "0-1") {
      if (game.blackEngineId === match.challengerEngineId) challengerWins++;
      else defenderWins++;
    } else if (game.result === "1/2-1/2") {
      draws++;
    }
  }

  await prisma.$transaction([
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
    })
  ]);

  // Send result notification
  await notifyMatchResult(match, deltaA, deltaB, challengerWins, defenderWins, draws);

  await updateGlobalRanks();
}

async function updateGlobalRanks() {
  await prisma.$executeRawUnsafe(`
    UPDATE "Engine" e
    SET "currentRank" = ranked.rank
    FROM (
      SELECT id, ROW_NUMBER() OVER (ORDER BY "currentRating" DESC) as rank
      FROM "Engine"
      WHERE status = 'active'
    ) ranked
    WHERE e.id = ranked.id
  `);
}

async function downloadAgent(key: string, dest: string) {
  const { Body } = await storage.send(new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  }));
  if (!Body) throw new Error(`Failed to download ${key}`);
  const bytes = await (Body as any).transformToByteArray();
  await fs.writeFile(dest, Buffer.from(bytes));
}

async function failSubmission(submissionId: string, versionId: string, reason: string) {
  console.log(`Validation failed: ${reason}`);
  await prisma.$transaction([
    prisma.engineVersion.update({
      where: { id: versionId },
      data: {
        validationStatus: ValidationStatus.failed,
        validationNotes: reason,
      },
    }),
    prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: SubmissionStatus.rejected,
        rejectionReason: reason,
      },
    }),
  ]);
}

const isPublicMode = process.argv.includes("--mode") &&
  process.argv[process.argv.indexOf("--mode") + 1] === "public";

if (isPublicMode) {
  import("./broker-runner").then(({ startBrokerRunner }) => {
    startBrokerRunner().catch((err) => {
      console.error("[Worker] Failed to start broker runner:", err);
      process.exit(1);
    });
  });
} else {
  console.log(`Chess Agents Worker started with ID: ${WORKER_ID}`);
  pollJobs();
  pollScheduler();
  pollReaper();
}
