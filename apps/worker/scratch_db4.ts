import { prisma } from './src/db.js';

async function run() {
  const versions = await prisma.engineVersion.findMany({
    where: { validationStatus: { in: ['pending', 'processing'] } },
    include: { engine: true }
  });
  console.log(`Found ${versions.length} versions in pending/processing state.`);
  
  for (const v of versions) {
    console.log(`Version ${v.id} of Engine ${v.engine?.name} status: ${v.validationStatus}`);
    
    // Let's see if there are corresponding jobs
    const jobs = await prisma.job.findMany({
      where: { jobType: 'submission_validate' }
    });
    
    const relatedJob = jobs.find(j => {
       const payload = j.payloadJson as any;
       return payload && payload.versionId === v.id;
    });
    console.log(`  Related job status: ${relatedJob?.status}, error: ${relatedJob?.lastError}`);
  }
}

run().finally(() => prisma.$disconnect());
