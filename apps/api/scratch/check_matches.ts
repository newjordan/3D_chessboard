import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
  const total = await prisma.match.count({ where: { status: 'completed' } });
  console.log(`TOTAL_COMPLETED_MATCHES: ${total}`);
  await prisma.$disconnect();
}
check();
