import "dotenv/config";
import { prisma } from "db";

async function main() {
  const counts = await prisma.job.groupBy({
    by: ['status'],
    _count: true
  });
  console.log("Job Status Counts:", JSON.stringify(counts, null, 2));

  const recentJobs = await prisma.job.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10
  });
  console.log("Recent Jobs:", JSON.stringify(recentJobs, null, 2));
}

main().catch(console.error);
