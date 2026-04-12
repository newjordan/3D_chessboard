import { PrismaClient } from "@prisma/client";
import { updateRatingsForMatch } from "../src/ratings/elo";

const prisma = new PrismaClient();

async function syncPendingRatings() {
  console.log("Starting manual rating synchronization...");
  
  const pendingJobs = await prisma.job.findMany({
    where: { 
      jobType: "rating_apply",
      status: "pending" 
    },
    orderBy: { runAt: "asc" }
  });

  console.log(`Found ${pendingJobs.length} pending rating updates.`);

  for (const job of pendingJobs) {
    const { matchId } = job.payloadJson as any;
    
    try {
      await prisma.$transaction(async (tx) => {
        const match = await tx.match.findUnique({
          where: { id: matchId },
          include: {
            challengerEngine: true,
            defenderEngine: true,
            games: true
          }
        });

        if (!match || match.status !== "completed") {
          console.log(`Match ${matchId} not completed yet, skipping.`);
          return;
        }

        // Idempotency
        const existing = await tx.rating.findFirst({ where: { matchId } });
        if (existing) {
          await tx.job.update({ where: { id: job.id }, data: { status: "completed" } });
          return;
        }

        const { deltaA, deltaB } = updateRatingsForMatch(
          match.challengerEngine.currentRating,
          match.defenderEngine.currentRating,
          Number(match.challengerScore),
          Number(match.defenderScore),
          match.gamesPlanned
        );

        let challengerWins = 0;
        let defenderWins = 0;
        let draws = 0;

        for (const game of match.games) {
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

        console.log(`Applying ratings for ${match.challengerEngine.name} vs ${match.defenderEngine.name}: ${deltaA} / ${deltaB}`);

        await tx.engine.update({
          where: { id: match.challengerEngineId },
          data: {
            currentRating: { increment: deltaA },
            gamesPlayed: { increment: match.gamesPlanned },
            wins: { increment: challengerWins },
            losses: { increment: defenderWins },
            draws: { increment: draws },
          }
        });

        await tx.engine.update({
          where: { id: match.defenderEngineId },
          data: {
            currentRating: { increment: deltaB },
            gamesPlayed: { increment: match.gamesPlanned },
            wins: { increment: defenderWins },
            losses: { increment: challengerWins },
            draws: { increment: draws },
          }
        });

        await tx.rating.create({
          data: {
            engineId: match.challengerEngineId,
            matchId: match.id,
            ratingBefore: match.challengerEngine.currentRating,
            ratingAfter: match.challengerEngine.currentRating + deltaA,
            delta: deltaA,
          }
        });

        await tx.rating.create({
          data: {
            engineId: match.defenderEngineId,
            matchId: match.id,
            ratingBefore: match.defenderEngine.currentRating,
            ratingAfter: match.defenderEngine.currentRating + deltaB,
            delta: deltaB,
          }
        });

        await tx.job.update({
          where: { id: job.id },
          data: { status: "completed" }
        });
      });
    } catch (error) {
      console.error(`Failed to process job ${job.id}:`, error);
    }
  }

  // Update ranks
  console.log("Updating global ranks...");
  await prisma.$executeRawUnsafe(`
    UPDATE "Engine" e
    SET "currentRank" = ranked.rank
    FROM (
      SELECT id, ROW_NUMBER() OVER (ORDER BY "currentRating" DESC) as rank
      FROM "Engine"
      WHERE status = 'active' AND "gamesPlayed" > 0
    ) ranked
    WHERE e.id = ranked.id
  `);

  console.log("Synchronization complete.");
}

syncPendingRatings().finally(() => prisma.$disconnect());
