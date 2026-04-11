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

  const opponents = await prisma.engine.findMany({
    where: {
      id: { not: version.engineId },
      status: EngineStatus.active,
    },
    take: 3,
    orderBy: {
      currentRating: "desc",
    },
  });

  console.log(`Preparing ${opponents.length} placement matches for ${version.engine.name}`);

  for (const opponent of opponents) {
    const match = await prisma.match.create({
      data: {
        challengerVersionId: version.id,
        challengerEngineId: version.engineId,
        defenderEngineId: opponent.id,
        defenderVersionId: (await prisma.engineVersion.findFirst({
          where: { engineId: opponent.id, validationStatus: "passed" },
          orderBy: { submittedAt: "desc" },
        }))?.id || "",
        matchType: MatchType.placement,
        gamesPlanned: 2,
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
