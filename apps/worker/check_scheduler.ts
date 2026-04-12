import { prisma, MatchStatus, JobType, JobStatus, EngineStatus } from './src/db.js';

async function run() {
  const activeEngines = await prisma.engine.findMany({
    where: {
      status: EngineStatus.active,
      versions: { some: { validationStatus: 'passed' } },
    },
    include: { versions: { where: { validationStatus: 'passed' }, take: 1 } },
  });

  const activeJobs = await prisma.job.count({
    where: {
      jobType: JobType.match_run,
      status: { in: [JobStatus.pending, JobStatus.processing] },
    },
  });

  let eligiblePairs = 0;
  for (let i = 0; i < activeEngines.length; i++) {
    for (let j = i + 1; j < activeEngines.length; j++) {
      const eA = activeEngines[i];
      const eB = activeEngines[j];
      const existingCount = await prisma.match.count({
        where: {
          OR: [
            { challengerEngineId: eA.id, defenderEngineId: eB.id },
            { challengerEngineId: eB.id, defenderEngineId: eA.id },
          ],
          status: { not: MatchStatus.canceled },
        },
      });

      if (existingCount < 1) {
        eligiblePairs++;
      }
    }
  }

  console.log(`Active Jobs: ${activeJobs}`);
  console.log(`Available Slots (Max 5): ${Math.max(0, 5 - activeJobs)}`);
  console.log(`Eligible Pairs remaining: ${eligiblePairs}`);
}

run().finally(() => prisma.$disconnect());
