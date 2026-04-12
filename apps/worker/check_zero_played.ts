import { prisma, EngineStatus } from './src/db.js';

async function run() {
  const zeroPlayed = await prisma.engine.findMany({
    where: {
      status: EngineStatus.active,
      gamesPlayed: 0
    },
    include: {
      versions: {
        where: { validationStatus: 'passed' }
      }
    }
  });

  console.log('Engines with 0 games played and their passed versions:');
  for (const e of zeroPlayed) {
    console.log(`- ${e.name} (ID: ${e.id}): ${e.versions.length} passed versions`);
  }
}

run().finally(() => prisma.$disconnect());
