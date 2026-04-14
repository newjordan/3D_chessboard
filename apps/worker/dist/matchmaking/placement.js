"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.preparePlacementMatches = preparePlacementMatches;
const db_1 = require("../db");
/**
 * Prepares placement matches for a newly validated engine version.
 * Pairs it with up to 3 existing engines to determine its initial strength.
 */
async function preparePlacementMatches(versionId) {
    const version = await db_1.prisma.engineVersion.findUnique({
        where: { id: versionId },
        include: { engine: true },
    });
    if (!version)
        throw new Error("Engine version not found");
    const allOpponents = await db_1.prisma.engine.findMany({
        where: {
            id: { not: version.engineId },
            status: db_1.EngineStatus.active,
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
        const defenderVersion = await db_1.prisma.engineVersion.findFirst({
            where: { engineId: opponent.id, validationStatus: "passed" },
            orderBy: { submittedAt: "desc" },
        });
        if (!defenderVersion) {
            console.warn(`Skipping opponent ${opponent.name} - no passed version found despite filter.`);
            continue;
        }
        const match = await db_1.prisma.match.create({
            data: {
                challengerVersionId: version.id,
                challengerEngineId: version.engineId,
                defenderEngineId: opponent.id,
                defenderVersionId: defenderVersion.id,
                matchType: db_1.MatchType.placement,
                gamesPlanned: 2, // Symmetric 2-game series
                timeControl: "40/60",
            },
        });
        await db_1.prisma.job.create({
            data: {
                jobType: db_1.JobType.match_run,
                payloadJson: { matchId: match.id },
                status: db_1.JobStatus.pending,
            },
        });
    }
    if (opponents.length === 0) {
        await db_1.prisma.engine.update({
            where: { id: version.engineId },
            data: { status: db_1.EngineStatus.active, currentRating: 1200 },
        });
    }
}
