import { prisma } from './src/db.js';

async function run() {
  const count = await prisma.match.count();
  const enginesWithPassedVersions = await prisma.engine.count({
    where: {
      status: 'active',
      versions: { some: { validationStatus: 'passed' } }
    }
  });

  console.log(`Total Matches in DB: ${count}`);
  console.log(`Engines with passed versions: ${enginesWithPassedVersions}`);
  
  if (enginesWithPassedVersions >= 2) {
    const theoreticalPairs = (enginesWithPassedVersions * (enginesWithPassedVersions - 1)) / 2;
    console.log(`Theoretical pairs for ${enginesWithPassedVersions} engines: ${theoreticalPairs}`);
  }
}

run().finally(() => prisma.$disconnect());
