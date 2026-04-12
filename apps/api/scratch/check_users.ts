import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
  const users = await prisma.user.findMany({
    select: { id: true, username: true, email: true }
  });
  console.log("Registered Users:", JSON.stringify(users, null, 2));
  await prisma.$disconnect();
}
check();
