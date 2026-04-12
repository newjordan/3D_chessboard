import { prisma, MatchType, MatchStatus, JobType, JobStatus, EngineStatus } from "../db";

/**
 * Rematch cooldown in milliseconds (12 hours).
 * Engines can play each other again after this period.
 */
const REMATCH_COOLDOWN_MS = 12 * 60 * 60 * 1000;

/**
 * How many matches to schedule per poll cycle to avoid flooding the queue.
 */
const BATCH_SIZE = 10;

/**
 * Maximum Elo distance for a "competitive" match.
 * If no engines are within this range, it will broaden the search.
 */
const ELO_PROXIMITY_WINDOW = 400;

interface EnginePairCandidate {
  engineA: any;
  engineB: any;
  score: number; // Higher is better for priority
}

/**
 * Actively schedules competitive rating matches.
 * Prioritizes:
 * 1. New engines (< 20 games) to get them ranked quickly.
 * 2. Engines close in Elo rating for meaningful progression.
 * 3. Enforces a cooldown to prevent redundant matches.
 */
export async function scheduleMatches(): Promise<number> {
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
      // - Bonus for new engines (under 20 games played)
      // - Penalty for Elo distance
      let score = 1000 - eloDiff;
      if (a.gamesPlayed < 20) score += 500;
      if (b.gamesPlayed < 20) score += 500;

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
          timeControl: "40/60",
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
}
