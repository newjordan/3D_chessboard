import { prisma } from './src/db.js';

async function run() {
  await prisma.job.updateMany({
    where: { status: 'processing', lockedAt: { lt: new Date(Date.now() - 1000 * 60 * 30) } },
    data: { status: 'failed', lastError: 'Timeout' }
  });
  console.log('Cleaned up old stuck jobs.');
}

run().finally(() => prisma.$disconnect());
