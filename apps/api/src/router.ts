import { router, publicProcedure, adminProcedure } from './trpc';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const prisma = new PrismaClient();

// S3/R2 Setup (matching index.ts)
const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});
const BUCKET_NAME = process.env.R2_BUCKET || "chess-agents";

export const appRouter = router({
  // --- MATCHES ---
  matches: router({
    getRandom: publicProcedure.query(async () => {
      const total = await prisma.match.count({ where: { status: "completed" } });
      if (total === 0) return null;
      
      const recentCount = Math.min(total, 50);
      const skip = Math.floor(Math.random() * recentCount);
      
      return prisma.match.findFirst({
        where: { status: "completed" },
        skip,
        include: {
          challengerEngine: { include: { owner: { select: { username: true, image: true } } } },
          defenderEngine: { include: { owner: { select: { username: true, image: true } } } },
        }
      });
    }),

    getList: publicProcedure
      .input(z.object({ engine: z.string().optional(), limit: z.number().default(50) }))
      .query(async ({ input }) => {
        const { engine: engineSlug, limit } = input;
        const where: any = {};
        if (engineSlug) {
          where.OR = [
            { challengerEngine: { slug: engineSlug } },
            { defenderEngine: { slug: engineSlug } }
          ];
        }
        return prisma.match.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: limit,
          include: {
            challengerEngine: { include: { owner: { select: { username: true, image: true } } } },
            defenderEngine: { include: { owner: { select: { username: true, image: true } } } },
          }
        });
      }),

    getById: publicProcedure
      .input(z.string())
      .query(async ({ input }) => {
        return prisma.match.findUnique({
          where: { id: input },
          include: {
            challengerEngine: { include: { owner: { select: { username: true, image: true } } } },
            defenderEngine: { include: { owner: { select: { username: true, image: true } } } },
            challengerVersion: true,
            defenderVersion: true,
          }
        });
      }),

    getPgn: publicProcedure
      .input(z.string())
      .query(async ({ input }) => {
        const match = await prisma.match.findUnique({
          where: { id: input },
          select: { pgnStorageKey: true }
        });

        if (!match?.pgnStorageKey) return null;

        const response = await s3Client.send(new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: match.pgnStorageKey,
        })) as any;

        return response.Body?.transformToString() || null;
      }),
  }),

  // --- ENGINES ---
  engines: router({
    getLeaderboard: publicProcedure.query(async () => {
      return prisma.engine.findMany({
        where: { status: "active" },
        orderBy: { currentRating: "desc" },
        include: {
          owner: { select: { username: true, image: true } },
          _count: {
            select: {
              matchesChallenged: { where: { status: "running" } },
              matchesDefended: { where: { status: "running" } },
            },
          },
        },
      });
    }),

    getBySlug: publicProcedure
      .input(z.string())
      .query(async ({ input }) => {
        return prisma.engine.findUnique({
          where: { slug: input },
          include: {
            owner: { select: { username: true, image: true, id: true } },
            versions: { orderBy: { submittedAt: "desc" } },
            matchesChallenged: { 
              orderBy: { createdAt: "desc" }, 
              take: 20,
              include: { defenderEngine: { include: { owner: { select: { username: true, image: true } } } } }
            },
            matchesDefended: { 
              orderBy: { createdAt: "desc" }, 
              take: 20,
              include: { challengerEngine: { include: { owner: { select: { username: true, image: true } } } } }
            },
            _count: { select: { matchesChallenged: true, matchesDefended: true } }
          }
        });
      }),

    getByOwner: publicProcedure
      .input(z.string())
      .query(async ({ input }) => {
        return prisma.engine.findMany({
          where: { ownerUserId: input },
          orderBy: { createdAt: "desc" },
          include: {
            owner: { select: { username: true, image: true } },
            versions: { orderBy: { submittedAt: "desc" }, take: 1 },
            _count: {
              select: {
                matchesChallenged: { where: { status: "running" } },
                matchesDefended: { where: { status: "running" } },
              },
            },
          },
        });
      }),
  }),

  // --- ADMIN ---
  admin: router({
    getStats: adminProcedure.query(async () => {
      const [userCount, engineCount, jobCount, matchCount] = await Promise.all([
        prisma.user.count(),
        prisma.engine.count(),
        prisma.job.count(),
        prisma.match.count()
      ]);
      return { userCount, engineCount, jobCount, matchCount };
    }),

    getAdvancedStats: adminProcedure.query(async () => {
      const engines = await prisma.engine.findMany({
        select: { currentRating: true }
      });

      const buckets: Record<number, number> = {};
      engines.forEach((e: any) => {
        const bucket = Math.floor(e.currentRating / 100) * 100;
        buckets[bucket] = (buckets[bucket] || 0) + 1;
      });

      const matchStats = await prisma.match.groupBy({
        by: ['status'],
        _count: true
      });

      return { eloDistribution: buckets, matchSummary: matchStats };
    }),

    getUsers: adminProcedure.query(async () => {
      return prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100
      });
    }),

    getJobs: adminProcedure.query(async () => {
      return prisma.job.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
      });
    }),

    retryJob: adminProcedure
      .input(z.string())
      .mutation(async ({ input }) => {
        return prisma.job.update({
          where: { id: input },
          data: { status: "pending", attempts: 0, lastError: null, lockedAt: null, workerId: null }
        });
      }),
  })
});

export type AppRouter = typeof appRouter;
