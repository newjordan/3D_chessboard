import { prisma, JobType, JobStatus } from './src/db.js';

async function run() {
  const activeJobs = await prisma.job.findMany({
    where: {
      jobType: JobType.match_run,
      status: { in: [JobStatus.pending, JobStatus.processing] },
    },
    orderBy: { createdAt: 'asc' }
  });

  for (const j of activeJobs) {
    console.log(`Job ${j.id}: status=${j.status}, lockedAt=${j.lockedAt}, createdAt=${j.createdAt}`);
  }
}

run().finally(() => prisma.$disconnect());
