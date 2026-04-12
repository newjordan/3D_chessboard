import { prisma, MatchType, MatchStatus, JobType, JobStatus, EngineStatus } from "../db";

/**
 * Maximum number of matches any engine pair is allowed to play.
 * This should equal the initial placement match count (1 match = 2 games).
 */
const MAX_MATCHES_PER_PAIR = 1;

/**
 * How many matches to schedule per poll cycle to avoid flooding the queue.
 */
const BATCH_SIZE = 40;

interface EnginePair {
  engineAId: string;
  engineBId: string;
}

/**
 * Actively polls for unplayed engine pairings and schedules rating matches.
 * Ensures no pair plays more than MAX_MATCHES_PER_PAIR times.
 *
 * Input: none (reads from DB)
 * Output: number of matches scheduled
 * Side effects: creates Match and Job rows in the database
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

  if (activeEngines.length < 2) {
    return 0;
  }

  // Build all unique pairs
  const pairs: EnginePair[] = [];
  for (let i = 0; i < activeEngines.length; i++) {
    for (let j = i + 1; j < activeEngines.length; j++) {
      pairs.push({
        engineAId: activeEngines[i].id,
        engineBId: activeEngines[j].id,
      });
    }
  }

  // Check how many pending/running match_run jobs exist to avoid overloading
  const activeJobs = await prisma.job.count({
    where: {
      jobType: JobType.match_run,
      status: { in: [JobStatus.pending, JobStatus.processing] },
    },
  });

  const availableSlots = Math.max(0, BATCH_SIZE - activeJobs);
  if (availableSlots === 0) {
    return 0;
  }

  let scheduled = 0;

  for (const pair of pairs) {
    if (scheduled >= availableSlots) break;

    // Count existing matches between this pair (in either direction)
    const existingCount = await prisma.match.count({
      where: {
        OR: [
          {
            challengerEngineId: pair.engineAId,
            defenderEngineId: pair.engineBId,
          },
          {
            challengerEngineId: pair.engineBId,
            defenderEngineId: pair.engineAId,
          },
        ],
        status: { not: MatchStatus.canceled },
      },
    });

    if (existingCount >= MAX_MATCHES_PER_PAIR) {
      continue;
    }

    // Get latest passed version for each engine
    const engineA = activeEngines.find((e) => e.id === pair.engineAId);
    const engineB = activeEngines.find((e) => e.id === pair.engineBId);

    if (!engineA?.versions[0] || !engineB?.versions[0]) {
      console.log(`[Scheduler] Skipping pair ${engineA?.name} vs ${engineB?.name} - missing passed version`);
      continue;
    }

    // Create match + job in a single transaction
    await prisma.$transaction(async (tx) => {
      const match = await tx.match.create({
        data: {
          challengerEngineId: pair.engineAId,
          defenderEngineId: pair.engineBId,
          challengerVersionId: engineA.versions[0].id,
          defenderVersionId: engineB.versions[0].id,
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

      console.log(
        `[Scheduler] Queued rating match: ${engineA.name} vs ${engineB.name} (${match.id})`
      );
    });

    scheduled++;
  }

  return scheduled;
}
