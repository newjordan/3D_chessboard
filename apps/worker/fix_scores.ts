import { prisma } from './src/db.js';

async function fixMatches() {
  const matches = await prisma.match.findMany({ include: { games: true } });
  
  let fixed = 0;
  for (const match of matches) {
    let challengerWins = 0;
    let defenderWins = 0;
    let draws = 0;

    for (const g of match.games) {
      if (g.result === "1-0") {
        if (g.whiteEngineId === match.challengerEngineId) challengerWins++;
        else defenderWins++;
      } else if (g.result === "0-1") {
        if (g.blackEngineId === match.challengerEngineId) challengerWins++;
        else defenderWins++;
      } else if (g.result === "1/2-1/2") {
        draws++;
      }
    }
    
    const challengerScore = challengerWins + (draws * 0.5);
    const defenderScore = defenderWins + (draws * 0.5);

    if (Number(match.challengerScore) !== challengerScore || Number(match.defenderScore) !== defenderScore) {
      await prisma.match.update({
        where: { id: match.id },
        data: { challengerScore, defenderScore }
      });
      fixed++;
    }
  }
  console.log(`Fixed ${fixed} historical match scores!`);
}

fixMatches().finally(() => prisma.$disconnect());
