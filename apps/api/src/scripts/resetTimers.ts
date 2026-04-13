import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🚀 Resetting Seasonal Timers...");

  // 1. Backdate matches to allow immediate rematches (bypassing the 1h cooldown for previous games)
  console.log("🕒 Backdating match records by 2 hours...");
  const matchResult = await prisma.$executeRaw`
    UPDATE "Match" 
    SET "createdAt" = "createdAt" - INTERVAL '2 hours'
  `;

  // 2. Backdate jobs to ensure they aren't seen as "brand new"
  console.log("📋 Backdating job records by 2 hours...");
  const jobResult = await prisma.$executeRaw`
    UPDATE "Job" 
    SET "createdAt" = "createdAt" - INTERVAL '2 hours'
  `;

  console.log(`✅ Reset complete! Backdated ${matchResult} matches and ${jobResult} jobs.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Reset failed:", err);
  process.exit(1);
});
