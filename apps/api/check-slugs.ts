import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  const engines = await prisma.engine.findMany({
    select: { name: true, slug: true }
  });
  console.log(JSON.stringify(engines, null, 2));
  await prisma.$disconnect();
}

main();
