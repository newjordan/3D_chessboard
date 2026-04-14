import { prisma, MatchType, MatchStatus, JobType, JobStatus, EngineStatus } from "../db";

/**
 * Rematch cooldown in milliseconds (15 minutes).
 * Engines can play each other again after this period.
 */
const REMATCH_COOLDOWN_MS = 15 * 60 * 1000;

/**
 * How many matches to schedule per poll cycle to avoid flooding the queue.
 * Set to 20 for Local Performance Mode (High-core CPUs like R9 7900X).
 */
const BATCH_SIZE = 200;

/**
 * Maximum Elo distance for a "competitive" match.
 * If no engines are within this range, it will broaden the search.
 */
const ELO_PROXIMITY_WINDOW = 800;

interface EnginePairCandidate {
  engineA: any;
  engineB: any;
  score: number; // Higher is better for priority
}

const SCHEDULER_LOCK_ID = 1337;

/**
 * Actively schedules competitive rating matches.
 * Prioritizes:
 * 1. New engines (< 30 games) to get them ranked quickly.
 * 2. Engines close in Elo rating for meaningful progression.
 * 3. Enforces a cooldown to prevent redundant matches.
 */
export async function scheduleMatches(): Promise<number> {
  // 0. Acquire Distributed Lock (Postgres Advisory Lock)
  // This ensures ONLY ONE worker replica runs the scheduler at a time.
  // Using hardcoded ID with explicit bigint cast to avoid type mismatch errors.
  const lock = await prisma.$queryRaw<[{ pg_try_advisory_lock: boolean }]>`SELECT pg_try_advisory_lock(1337::bigint)`;
  
  if (!lock || !lock[0].pg_try_advisory_lock) {
    return 0; // Lock is held by another worker replica
  }

  try {
    const activeEngines = await prisma.engine.findMany({
      where: {
        status: EngineStatus.active,
        versions: {
          some: { validationStatus: "passed" },
        },
      },
      orderBy: { currentRating: "desc" },
      include: {
        versions: {
          where: { validationStatus: "passed" },
          orderBy: { submittedAt: "desc" },
          take: 1,
        },
      },
    });

    if (activeEngines.length < 2) return 0;

  // Check how many pending/processing jobs exist
  const activeJobs = await prisma.job.count({
    where: {
      jobType: JobType.match_run,
      status: { in: [JobStatus.pending, JobStatus.processing] },
    },
  });

  const availableSlots = Math.max(0, BATCH_SIZE - activeJobs);
  if (availableSlots === 0) return 0;

  const candidates: EnginePairCandidate[] = [];

  // 1. Generate all technically valid pairs
  for (let i = 0; i < activeEngines.length; i++) {
    for (let j = i + 1; j < activeEngines.length; j++) {
      const a = activeEngines[i];
      const b = activeEngines[j];

      // Anti-win-trading
      if (a.ownerUserId === b.ownerUserId) continue;

      const eloDiff = Math.abs(a.currentRating - b.currentRating);
      
      // Calculate a "Priority Score"
      // - Bonus for new engines (under 30 games played)
      // - Penalty for Elo distance
      // Use Math.max to prevent extremely negative scores from large gaps
      let score = Math.max(0, 1000 - eloDiff);
      if (a.gamesPlayed < 30) score += 500;
      if (b.gamesPlayed < 30) score += 500;

      candidates.push({ engineA: a, engineB: b, score });
    }
  }

  // 2. Sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  let scheduled = 0;
  const processedEngines = new Set<string>();

  for (const candidate of candidates) {
    if (scheduled >= availableSlots) break;

    // Avoid scheduling the same engine twice in the same burst for better spread
    if (processedEngines.has(candidate.engineA.id) || processedEngines.has(candidate.engineB.id)) {
      continue;
    }

    // 3. Cooldown Verification (Expensive DB check, only done for top candidates)
    const lastMatch = await prisma.match.findFirst({
      where: {
        OR: [
          { challengerEngineId: candidate.engineA.id, defenderEngineId: candidate.engineB.id },
          { challengerEngineId: candidate.engineB.id, defenderEngineId: candidate.engineA.id },
        ],
        status: { not: MatchStatus.canceled },
      },
      orderBy: { createdAt: "desc" },
    });

    if (lastMatch && lastMatch.createdAt.getTime() > Date.now() - REMATCH_COOLDOWN_MS) {
      continue;
    }

    // 4. Schedule the Match
    await prisma.$transaction(async (tx) => {
      const match = await tx.match.create({
        data: {
          challengerEngineId: candidate.engineA.id,
          defenderEngineId: candidate.engineB.id,
          challengerVersionId: candidate.engineA.versions[0].id,
          defenderVersionId: candidate.engineB.versions[0].id,
          matchType: MatchType.rating,
          gamesPlanned: 2,
          timeControl: "5+0.1", // Blitz time control as used in common engine matches
          status: MatchStatus.queued,
        },
      });

      await tx.job.create({
        data: {
          jobType: JobType.match_run,
          payloadJson: { matchId: match.id },
          status: JobStatus.pending,
        },
      });

      console.log(`[Scheduler] Queued competitive match: ${candidate.engineA.name} (${candidate.engineA.currentRating}) vs ${candidate.engineB.name} (${candidate.engineB.currentRating})`);
    });

    processedEngines.add(candidate.engineA.id);
    processedEngines.add(candidate.engineB.id);
    scheduled++;
  }

  return scheduled;
} finally {
  // Always release the lock so other workers can try again in the next 30s cycle
  // Fix: Renamed from pg_release_advisory_lock (incorrect name) to pg_advisory_unlock (correct Postgres name)
  await prisma.$executeRaw`SELECT pg_advisory_unlock(1337::bigint)`;
}
}

/**
 * Finds jobs that have been 'processing' for more than 30 minutes
 * and marks them as failed so the scheduler can move on.
 */
export async function reapStaleJobs(): Promise<number> {
  const STALE_THRESHOLD_MS = 5 * 60 * 1000;
  const staleTime = new Date(Date.now() - STALE_THRESHOLD_MS);

  const staleJobs = await prisma.job.findMany({
    where: {
      status: JobStatus.processing,
      updatedAt: { lt: staleTime },
    },
  });

  if (staleJobs.length === 0) return 0;

  console.log(`[Reaper] Clearing ${staleJobs.length} stale jobs.`);

  for (const job of staleJobs) {
    await prisma.job.update({
      where: { id: job.id },
      data: { status: JobStatus.failed },
    });

    // If it was a match, cancel the match too
    if (job.jobType === JobType.match_run && job.payloadJson && (job.payloadJson as any).matchId) {
      await prisma.match.update({
        where: { id: (job.payloadJson as any).matchId },
        data: { status: MatchStatus.canceled },
      }).catch(() => {});
    }
  }

  return staleJobs.length;
}
