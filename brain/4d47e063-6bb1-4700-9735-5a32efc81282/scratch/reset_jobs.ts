import "dotenv/config";
import { prisma, JobStatus } from "db";

async function main() {
  const result = await prisma.job.updateMany({
    where: { status: JobStatus.failed },
    data: { 
      status: JobStatus.pending,
      attempts: 0,
      lastError: null,
      updatedAt: new Date()
    }
  });
  console.log(`Reset ${result.count} failed jobs to pending.`);
}

main().catch(console.error);
