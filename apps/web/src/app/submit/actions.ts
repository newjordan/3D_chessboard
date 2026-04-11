"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma, JobType, JobStatus, EngineStatus, ValidationStatus, SubmissionStatus } from "db";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";

const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

const BUCKET_NAME = process.env.R2_BUCKET || "chess-agents";

export async function submitEngine(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    throw new Error("Authentication required");
  }

  const file = formData.get("file") as File;
  const engineName = formData.get("name") as string;

  if (!file || !engineName) {
    throw new Error("Missing file or engine name");
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  
  // Compute SHA256 for dedupe and audit
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");

  try {
    // 1. Create Engine record if it doesn't exist (using slug)
    const slug = engineName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    
    const userId = (session.user as any).id;

    const engine = await prisma.engine.upsert({
      where: { slug },
      create: {
        name: engineName,
        slug,
        ownerUserId: userId,
        status: EngineStatus.pending,
      },
      update: {
        updatedAt: new Date(),
      },
    });

    // 2. Upload to R2
    const storageKey = `engines/${engine.id}/${sha256}`;
    
    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: storageKey,
      Body: buffer,
      ContentType: "application/octet-stream",
    }));

    // 3. Create EngineVersion
    const version = await prisma.engineVersion.create({
      data: {
        engineId: engine.id,
        storageKey,
        sha256,
        fileSizeBytes: buffer.length,
        targetArch: "x86_64", // MVP default
        validationStatus: ValidationStatus.pending,
      },
    });

    // 4. Create Submission
    const submission = await prisma.submission.create({
      data: {
        engineVersionId: version.id,
        submittedByUserId: userId,
        status: SubmissionStatus.uploaded,
      },
    });

    // 5. Create Validation Job
    await prisma.job.create({
      data: {
        jobType: JobType.submission_validate,
        payloadJson: {
          submissionId: submission.id,
          versionId: version.id,
          storageKey,
        },
        status: JobStatus.pending,
      },
    });

    return { success: true, submissionId: submission.id };
  } catch (error: any) {
    console.error("Submission error:", error);
    if (error.code === 'P2002') {
      return { success: false, error: "This engine binary (SHA256) has already been submitted." };
    }
    return { success: false, error: error.message || "An unknown error occurred during submission." };
  }
}
