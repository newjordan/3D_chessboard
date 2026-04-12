import { prisma } from './src/db.js';

async function run() {
  const failedJobs = await prisma.job.findMany({
    where: { jobType: 'submission_validate', status: 'failed' }
  });
  console.log(`Failed submission_validate jobs: ${failedJobs.length}`);
  if (failedJobs.length > 0) {
    const payloads = failedJobs.map((j) => {
        const p = j.payloadJson as any;
        return { error: j.lastError, versionId: p?.versionId };
    });
    console.log("Details:", payloads);

    // Let's check the status of these EngineVersions
    for (const p of payloads) {
        if (!p.versionId) continue;
        const v = await prisma.engineVersion.findUnique({ where: { id: p.versionId }});
        console.log(`Version ${p.versionId} has validationStatus='${v?.validationStatus}' despite its job failing!`);
    }
  }
  
  const processingJobs = await prisma.job.findMany({
    where: { jobType: 'submission_validate', status: 'processing' }
  });
  console.log(`Processing valid. jobs: ${processingJobs.length}`);
}

run().finally(() => prisma.$disconnect());
