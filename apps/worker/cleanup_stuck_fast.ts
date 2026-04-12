import { prisma } from './src/db.js';

async function run() {
  await prisma.job.updateMany({
    where: { status: 'processing', lockedAt: { lt: new Date(Date.now() - 1000 * 60 * 5) } },
    data: { status: 'failed', lastError: 'Stuck/Killed on deploy' }
  });
  console.log('Cleaned up recently stuck jobs.');
}

run().finally(() => prisma.$disconnect());
