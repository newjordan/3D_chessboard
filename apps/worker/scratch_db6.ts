import { prisma } from './src/db.js';

async function run() {
  const versions = await prisma.engineVersion.findMany({
    where: { validationStatus: { not: 'passed' } }
  });
  console.log('Versions not passed:');
  for (const v of versions) {
     console.log(`- Version ${v.id} status is ${v.validationStatus}`);
     // check if a job exists for this version
     const jobs = await prisma.job.findMany({ where: { jobType: 'submission_validate' } });
     const matchingJob = jobs.find(j => {
        const payload = j.payloadJson as any;
        return payload && payload.versionId === v.id;
     });
     console.log(`  => Job exists? ${!!matchingJob}, status: ${matchingJob?.status}, error: ${matchingJob?.lastError}`);
  }
}

run().finally(() => prisma.$disconnect());
