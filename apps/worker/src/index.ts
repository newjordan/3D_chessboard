import dotenv from "dotenv";
dotenv.config();

import { prisma, JobStatus, JobType, EngineStatus, ValidationStatus, SubmissionStatus, MatchStatus } from "./db";
import { storage, BUCKET_NAME } from "./storage";
import { validateElfHeader } from "./validation/elf";
import { probeUci } from "./validation/uci";
import { preparePlacementMatches } from "./matchmaking/placement";
import { runMatch } from "./matchmaking/cutechess";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { updateRatingsForMatch } from "./ratings/elo";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { Readable } from "stream";
import { chmodSync } from "fs";

const WORKER_ID = `worker-${process.env.HOSTNAME || Math.random().toString(36).substring(7)}`;

async function pollJobs() {
  try {
    const job = await prisma.$transaction(async (tx) => {
      const pendingJobs = await tx.$queryRawUnsafe<any[]>(`
        SELECT id FROM "Job"
        WHERE status = 'pending' AND "runAt" <= NOW()
        ORDER BY "runAt" ASC
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

  // Poll again after a delay
  setTimeout(pollJobs, 2000);
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
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "engine-"));
  const tempPath = path.join(tempDir, "engine_bin");

  try {
    // 1. Download from R2
    console.log(`Downloading ${storageKey} to ${tempPath}...`);
    const { Body } = await storage.send(new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: storageKey,
    }));

    if (!Body) throw new Error("Empty response from R2");

    const arrayBuffer = await (Body as any).transformToByteArray();
    await fs.writeFile(tempPath, Buffer.from(arrayBuffer));

    // 2. Set executable permissions
    chmodSync(tempPath, 0o755);

    // 3. Static check (ELF)
    console.log("Running ELF header check...");
    const staticCheck = await validateElfHeader(tempPath);
    if (!staticCheck.isValid) {
      await failSubmission(submissionId, versionId, staticCheck.error || "Invalid ELF header");
      return;
    }

    // 4. Dynamic check (UCI Probe)
    console.log("Running UCI handshake probe...");
    const uciCheck = await probeUci(tempPath);
    if (!uciCheck.isUci) {
      await failSubmission(submissionId, versionId, uciCheck.error || "Binary does not speak UCI protocol");
      return;
    }

    // 5. Success! Update DB
    console.log(`Validation passed: ${uciCheck.name} by ${uciCheck.author}`);
    await prisma.$transaction([
      prisma.engineVersion.update({
        where: { id: versionId },
        data: {
          validationStatus: ValidationStatus.passed,
          validatedAt: new Date(),
          uciName: uciCheck.name,
          uciAuthor: uciCheck.author,
        },
      }),
      prisma.submission.update({
        where: { id: submissionId },
        data: { status: SubmissionStatus.validated },
      }),
      prisma.engine.update({
        where: { id: (await prisma.engineVersion.findUnique({ where: { id: versionId } }))?.engineId },
        data: { status: EngineStatus.active },
      }),
      // Enqueue placement
      prisma.job.create({
        data: {
          jobType: JobType.placement_prepare,
          payloadJson: { submissionId, versionId },
          status: JobStatus.pending,
        },
      }),
    ]);
  } finally {
    // Cleanup
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
    }
  });

  if (!match) throw new Error("Match not found");

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "match-"));
  const pathA = path.join(tempDir, "engine_a");
  const pathB = path.join(tempDir, "engine_b");

  try {
    // 1. Download binaries
    console.log(`Downloading engines for match ${matchId}...`);
    await downloadBinary(match.challengerVersion.storageKey, pathA);
    await downloadBinary(match.defenderVersion.storageKey, pathB);

    chmodSync(pathA, 0o755);
    chmodSync(pathB, 0o755);

    // 2. Run match
    const result = await runMatch(pathA, pathB, {
      games: match.gamesPlanned,
      tc: "40/60" // 1 minute per 40 moves
    });

    // 3. Validate score integrity
    const challengerWins = result.games.filter(g => g.result === "1-0").length;
    const defenderWins = result.games.filter(g => g.result === "0-1").length;
    const draws = result.games.filter(g => g.result === "1/2-1/2").length;
    const totalGames = challengerWins + defenderWins + draws;

    if (totalGames !== match.gamesPlanned) {
      throw new Error(`Score integrity check failed: ${totalGames} games counted but ${match.gamesPlanned} expected`);
    }

    const challengerScore = challengerWins + (draws * 0.5);
    const defenderScore = defenderWins + (draws * 0.5);

    // Verify scores are within valid bounds
    if (challengerScore + defenderScore !== match.gamesPlanned) {
      throw new Error(`Score integrity check failed: scores sum to ${challengerScore + defenderScore}, expected ${match.gamesPlanned}`);
    }

    // 4. Save PGN to R2
    const pgnKey = `matches/${matchId}/match.pgn`;
    await storage.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: pgnKey,
      Body: result.pgn,
      ContentType: "application/x-chess-pgn",
    }));

    // 5. Update Match results
    await prisma.$transaction([
      prisma.match.update({
        where: { id: matchId },
        data: {
          status: "completed",
          completedAt: new Date(),
          challengerScore,
          defenderScore,
          pgnStorageKey: pgnKey,
        }
      }),
      // Create Game records
      ...result.games.map(g => prisma.game.create({
        data: {
          matchId,
          roundIndex: g.round,
          whiteEngineId: match.challengerEngineId,
          blackEngineId: match.defenderEngineId,
          result: g.result,
          pgnStorageKey: "",
        }
      })),
      // Enqueue Rating Update
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

  // Idempotency check: skip if ratings already applied for this match
  const existingRating = await prisma.rating.findFirst({
    where: { matchId },
  });
  if (existingRating) {
    console.log(`Ratings already applied for match ${matchId}, skipping`);
    return;
  }

  // 1. Calculate Elo Change
  const { deltaA, deltaB } = updateRatingsForMatch(
    match.challengerEngine.currentRating,
    match.defenderEngine.currentRating,
    Number(match.challengerScore),
    Number(match.defenderScore),
    match.gamesPlanned
  );

  // 2. Update Engines and Ratings atomically
  await prisma.$transaction([
    prisma.engine.update({
      where: { id: match.challengerEngineId },
      data: {
        currentRating: { increment: deltaA },
        gamesPlayed: { increment: match.gamesPlanned },
        wins: { increment: Number(match.challengerScore) === match.gamesPlanned ? 1 : 0 },
        updatedAt: new Date(),
      }
    }),
    prisma.engine.update({
      where: { id: match.defenderEngineId },
      data: {
        currentRating: { increment: deltaB },
        gamesPlayed: { increment: match.gamesPlanned },
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

  // 3. Recalculate Global Ranks atomically
  await updateGlobalRanks();
}

async function updateGlobalRanks() {
  // Use a raw query to update all ranks atomically in a single statement
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

async function downloadBinary(key: string, dest: string) {
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

console.log(`Chess Ladder Worker started with ID: ${WORKER_ID}`);
pollJobs();
