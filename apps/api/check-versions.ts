import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  const engines = await prisma.engine.findMany({
    where: { status: "active" },
    include: {
      versions: {
        where: { validationStatus: "passed" },
        orderBy: { submittedAt: "desc" },
        take: 1
      }
    }
  });
  
  console.log(JSON.stringify(engines.map(e => ({
    name: e.name,
    active: e.status,
    hasPassedVersion: e.versions.length > 0,
    latestVersionId: e.versions[0]?.id || null
  })), null, 2));
  
  await prisma.$disconnect();
}

main();
