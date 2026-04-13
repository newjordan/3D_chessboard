import { prisma, MatchType, MatchStatus, JobType, JobStatus, EngineStatus } from "../db";

/**
 * Prepares placement matches for a newly validated engine version.
 * Pairs it with up to 3 existing engines to determine its initial strength.
 */
export async function preparePlacementMatches(versionId: string) {
  const version = await prisma.engineVersion.findUnique({
    where: { id: versionId },
    include: { engine: true },
  });

  if (!version) throw new Error("Engine version not found");

  const allOpponents = await prisma.engine.findMany({
    where: {
      id: { not: version.engineId },
      status: EngineStatus.active,
      versions: {
        some: { validationStatus: "passed" }
      }
    },
  });

  // Shuffle and pick 10
  const opponents = allOpponents
    .sort(() => 0.5 - Math.random())
    .slice(0, 10);

  console.log(`Preparing placement matches for ${version.engine.name} against ${opponents.length} valid opponents`);

  for (const opponent of opponents) {
    const defenderVersion = await prisma.engineVersion.findFirst({
      where: { engineId: opponent.id, validationStatus: "passed" },
      orderBy: { submittedAt: "desc" },
    });

    if (!defenderVersion) {
      console.warn(`Skipping opponent ${opponent.name} - no passed version found despite filter.`);
      continue;
    }

    const match = await prisma.match.create({
      data: {
        challengerVersionId: version.id,
        challengerEngineId: version.engineId,
        defenderEngineId: opponent.id,
        defenderVersionId: defenderVersion.id,
        matchType: MatchType.placement,
        gamesPlanned: 2, // Symmetric 2-game series
        timeControl: "40/60",
      },
    });

    await prisma.job.create({
      data: {
        jobType: JobType.match_run,
        payloadJson: { matchId: match.id },
        status: JobStatus.pending,
      },
    });
  }

  if (opponents.length === 0) {
    await prisma.engine.update({
      where: { id: version.engineId },
      data: { status: EngineStatus.active, currentRating: 1200 },
    });
  }
}
