import { PrismaClient } from "@prisma/client";
import { updateRatingsForMatch } from "../apps/worker/src/ratings/elo";

async function main() {
  const prisma = new PrismaClient();
  console.log("Starting TOTAL Leaderboard Reputations Repair (Ratings + Stats)...");

  // 1. Reset all ratings and stats to baseline
  console.log("Resetting all engines to 1200 Elo...");
  await prisma.engine.updateMany({
    data: {
      currentRating: 1200,
      wins: 0,
      losses: 0,
      draws: 0,
      gamesPlayed: 0,
      currentRank: null
    }
  });

  // 2. Clear historical rating records to fix the graphs
  console.log("Clearing historical rating entries...");
  await prisma.rating.deleteMany({});

  // 3. Replay every completed match in chronological order
  const matches = await prisma.match.findMany({
    where: { status: "completed" },
    include: {
      challengerEngine: true,
      defenderEngine: true,
      games: true
    },
    orderBy: { completedAt: "asc" }
  });

  console.log(`Replaying ${matches.length} historical matches...`);

  for (const match of matches) {
    // We need the NEWEST ratings from the DB for these engines
    const engA = await prisma.engine.findUnique({ where: { id: match.challengerEngineId } });
    const engB = await prisma.engine.findUnique({ where: { id: match.defenderEngineId } });

    if (!engA || !engB) continue;

    // Calculate score for this match
    const challengerWins = match.games.filter(g => 
        (g.result === "1-0" && g.whiteEngineId === engA.id) || 
        (g.result === "0-1" && g.blackEngineId === engA.id)
    ).length;
    const defenderWins = match.games.filter(g => 
        (g.result === "1-0" && g.whiteEngineId === engB.id) || 
        (g.result === "0-1" && g.blackEngineId === engB.id)
    ).length;
    const draws = match.games.filter(g => g.result === "1/2-1/2").length;

    const scoreA = challengerWins + (draws * 0.5);
    const scoreB = defenderWins + (draws * 0.5);

    const { deltaA, deltaB } = updateRatingsForMatch(
      engA.currentRating,
      engB.currentRating,
      scoreA,
      scoreB,
      match.gamesPlanned
    );

    // Update Engines
    await prisma.$transaction([
      prisma.engine.update({
        where: { id: engA.id },
        data: {
          currentRating: { increment: deltaA },
          wins: { increment: challengerWins },
          losses: { increment: defenderWins },
          draws: { increment: draws },
          gamesPlayed: { increment: match.gamesPlanned }
        }
      }),
      prisma.engine.update({
        where: { id: engB.id },
        data: {
          currentRating: { increment: deltaB },
          wins: { increment: defenderWins },
          losses: { increment: challengerWins },
          draws: { increment: draws },
          gamesPlayed: { increment: match.gamesPlanned }
        }
      }),
      // Create rating history
      prisma.rating.create({
        data: {
          engineId: engA.id,
          matchId: match.id,
          ratingBefore: engA.currentRating,
          ratingAfter: engA.currentRating + deltaA,
          delta: deltaA
        }
      }),
      prisma.rating.create({
        data: {
          engineId: engB.id,
          matchId: match.id,
          ratingBefore: engB.currentRating,
          ratingAfter: engB.currentRating + deltaB,
          delta: deltaB
        }
      })
    ]);
  }

  // 4. Final Rank update
  console.log("Finalizing rankings...");
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

  console.log("REPAIR COMPLETE. The leaderboard is now accurate.");
  await prisma.$disconnect();
}

main().catch(console.error);
