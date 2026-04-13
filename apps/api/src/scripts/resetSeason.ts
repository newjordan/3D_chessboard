
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load env from root
dotenv.config({ path: resolve(__dirname, '../../../../.env') });

const prisma = new PrismaClient();

async function resetSeason() {
  console.log('🚀 Starting Seasonal Reset...');

  try {
    // 1. Wipe historical data
    console.log('🧹 Purging Matches, Games, and Ratings...');
    const ratingCount = await prisma.rating.deleteMany();
    const gameCount = await prisma.game.deleteMany();
    const matchCount = await prisma.match.deleteMany();
    console.log(`✅ Deleted ${ratingCount.count} ratings, ${gameCount.count} games, and ${matchCount.count} matches.`);

    // 2. Clear out pending/running jobs related to old matches
    console.log('🧹 Clearing stale match jobs...');
    const jobCount = await prisma.job.deleteMany({
      where: {
        jobType: {
          in: ["match_run", "rating_apply", "placement_prepare"]
        }
      }
    });
    console.log(`✅ Cleared ${jobCount.count} stale jobs.`);

    // 3. Reset all engine statistics and Normalize Quotas
    console.log('⚖️  Normalizing quotas and resetting stats...');
    const users = await prisma.user.findMany({
      include: {
        engines: {
          orderBy: { updatedAt: 'desc' }
        }
      }
    });

    let totalActiveReset = 0;
    let totalDeactivated = 0;

    for (const user of users) {
      const userEngines = user.engines;
      let activeCount = 0;

      for (const engine of userEngines) {
        let targetStatus = engine.status;

        // If engine was active/pending, evaluate against quota
        if (engine.status === "active" || engine.status === "pending") {
          if (activeCount < 5) {
            // Keep active, but reset stats
            targetStatus = "active";
            activeCount++;
            totalActiveReset++;
          } else {
            // Over quota, deactivate
            targetStatus = "disabled_by_owner";
            totalDeactivated++;
            console.log(`   [Quota] Deactivated ${engine.name} (${engine.slug}) for user ${user.username || user.id}`);
          }
        }

        // Apply reset + potential status change
        await prisma.engine.update({
          where: { id: engine.id },
          data: {
            status: targetStatus as any,
            currentRating: 1200,
            currentRank: null,
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            draws: 0
          }
        });
      }
    }

    console.log(`✅ Stats reset for all engines.`);
    console.log(`✅ Quota enforced: ${totalActiveReset} kept active, ${totalDeactivated} deactivated.`);

    // 4. Trigger Placement for everyone currently active
    console.log('🎯 Enqueueing 20-game placement series for all active engines...');
    const activeEngines = await prisma.engine.findMany({
      where: { status: "active" }
    });

    for (const engine of activeEngines) {
      // Find latest passed version
      const latestVersion = await prisma.engineVersion.findFirst({
        where: { engineId: engine.id, validationStatus: 'passed' },
        orderBy: { submittedAt: 'desc' }
      });

      if (latestVersion) {
        const sub = await prisma.submission.findFirst({ 
          where: { engineVersionId: latestVersion.id },
          orderBy: { createdAt: 'desc' }
        });

        await prisma.job.create({
          data: {
            jobType: "placement_prepare",
            payloadJson: { 
              submissionId: sub?.id,
              versionId: latestVersion.id 
            },
            status: "pending"
          }
        });
      }
    }

    console.log(`✅ Enqueued placement for ${activeEngines.length} engines.`);
    console.log('\n✨ SEASON RESET COMPLETE. GLHF! ✨');

  } catch (error) {
    console.error('❌ Reset failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

resetSeason();
