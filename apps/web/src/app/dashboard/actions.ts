"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma, EngineStatus } from "@/lib/db";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { revalidatePath } from "next/cache";

const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

const BUCKET_NAME = process.env.R2_BUCKET || "jdevservices";

export async function deleteEngine(engineId: string) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    throw new Error("Authentication required");
  }

  const userId = (session.user as any).id;

  // 1. Fetch engine and verify ownership
  const engine = await prisma.engine.findUnique({
    where: { id: engineId },
    include: {
      versions: true,
    },
  });

  if (!engine) {
    throw new Error("Engine not found");
  }

  if (engine.ownerUserId !== userId) {
    throw new Error("You do not have permission to delete this engine");
  }

  try {
    if (engine.gamesPlayed === 0) {
      // HARD DELETE
      console.log(`Hard deleting engine ${engine.name} (${engineId})`);

      // Delete versions from R2
      for (const version of engine.versions) {
        try {
          await s3Client.send(new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: version.storageKey,
          }));
        } catch (s3Err) {
          console.error(`Failed to delete ${version.storageKey} from R2:`, s3Err);
          // Continue anyway to clean up DB
        }
      }

      // Delete from DB (cascades to versions, submissions, and jobs)
      await prisma.engine.delete({
        where: { id: engineId },
      });
    } else {
      // SOFT DELETE / DISABLE
      console.log(`Soft deleting engine ${engine.name} (${engineId})`);
      await prisma.engine.update({
        where: { id: engineId },
        data: {
          status: EngineStatus.disabled,
          currentRank: null,
          updatedAt: new Date(),
        },
      });
    }

    revalidatePath("/dashboard");
    revalidatePath("/leaderboard");
    return { success: true };
  } catch (error: any) {
    console.error("Deletion error:", error);
    return { success: false, error: error.message || "Failed to delete engine" };
  }
}
