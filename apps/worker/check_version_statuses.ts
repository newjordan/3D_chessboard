import { prisma } from './src/db.js';

async function run() {
  const engineIds = [
    '5d4553d5-c3d5-4763-b9b7-6cb3f4ea0e9a', 
    '588a9205-3d7d-43a6-8f9c-c002a7a07f23', 
    'b54d82e9-2893-46c1-b848-c0c2cea9e032', 
    '0d65874f-41a2-439c-a5bf-70fbd0e420b5'
  ];

  const versions = await prisma.engineVersion.findMany({
    where: { engineId: { in: engineIds } },
    select: {
      engine: { select: { name: true } },
      validationStatus: true,
      validationNotes: true,
      submittedAt: true
    }
  });

  console.log('Version statuses for the 0-played engines:');
  for (const v of versions) {
    console.log(`- ${v.engine.name}: Status=${v.validationStatus}, Notes=${v.validationNotes}, SubmittedAt=${v.submittedAt}`);
  }
}

run().finally(() => prisma.$disconnect());
