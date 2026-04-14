CREATE TYPE "RunnerKeyRequestStatus" AS ENUM ('pending', 'fulfilled', 'rejected');

CREATE TABLE "RunnerKeyRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "note" TEXT,
    "status" "RunnerKeyRequestStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RunnerKeyRequest_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "RunnerKeyRequest" ADD CONSTRAINT "RunnerKeyRequest_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
