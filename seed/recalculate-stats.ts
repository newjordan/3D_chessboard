import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  console.log("Starting Leaderboard Statistics Recalculation...");

  const engines = await prisma.engine.findMany();
  console.log(`Analyzing ${engines.length} engines...`);

  for (const engine of engines) {
    // 1. Calculate Games Played
    const gamesAsWhite = await prisma.game.findMany({ where: { whiteEngineId: engine.id } });
    const gamesAsBlack = await prisma.game.findMany({ where: { blackEngineId: engine.id } });
    
    const allGames = [...gamesAsWhite, ...gamesAsBlack];
    const gamesPlayed = allGames.length;

    // 2. Calculate Wins, Losses, Draws
    let wins = 0;
    let losses = 0;
    let draws = 0;

    for (const game of allGames) {
      if (game.result === "1/2-1/2") {
        draws++;
      } else if (game.result === "1-0") {
        if (game.whiteEngineId === engine.id) wins++;
        else losses++;
      } else if (game.result === "0-1") {
        if (game.blackEngineId === engine.id) wins++;
        else losses++;
      }
    }

    // 3. Update Engine record
    await prisma.engine.update({
      where: { id: engine.id },
      data: {
        wins,
        losses,
        draws,
        gamesPlayed,
      }
    });

    console.log(`Updated ${engine.name}: ${wins}W / ${draws}D / ${losses}L (${gamesPlayed} games)`);
  }

  // 4. Update Rankings
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

  console.log("Recalculation finished! Rankings refreshed.");
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
