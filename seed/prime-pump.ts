import { PrismaClient, EngineStatus, JobType, JobStatus } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  console.log("Starting 'Prime the Pump' - Kickstarting Matchmaking...");

  // 1. Reset failed jobs that might be blocking progress
  const resetCount = await prisma.job.updateMany({
    where: { status: JobStatus.failed },
    data: { status: JobStatus.pending, attempts: 0 }
  });
  console.log(`Reset ${resetCount.count} failed jobs to pending.`);

  // 2. Find engines that are active but have no matches scheduled
  const activeEngines = await prisma.engine.findMany({
    where: { 
      status: EngineStatus.active,
      gamesPlayed: 0
    },
    include: {
      versions: {
        where: { validationStatus: "passed" },
        orderBy: { submittedAt: "desc" },
        take: 1
      }
    }
  });

  console.log(`Found ${activeEngines.length} active engines with 0 games.`);

  let jobsCreated = 0;
  for (const engine of activeEngines) {
    const version = engine.versions[0];
    if (!version) {
      console.log(`Skipping ${engine.name} - no passed version found.`);
      continue;
    }

    // Check if a job already exists for this version to avoid duplicates
    const existingJob = await prisma.job.findFirst({
      where: {
        jobType: JobType.placement_prepare,
        payloadJson: {
          path: ["versionId"],
          equals: version.id
        }
      }
    });

    if (existingJob) {
      console.log(`Job already exists for ${engine.name}, skipping.`);
      continue;
    }

    await prisma.job.create({
      data: {
        jobType: JobType.placement_prepare,
        payloadJson: { versionId: version.id },
        status: JobStatus.pending
      }
    });
    console.log(`Created placement_prepare job for ${engine.name} (${version.id})`);
    jobsCreated++;
  }

  console.log(`Finished! Created ${jobsCreated} new placement jobs.`);
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
