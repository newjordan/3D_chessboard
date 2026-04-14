-- CreateTable
CREATE TABLE "RunnerKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT,
    "publicKey" TEXT NOT NULL,
    "privateKey" TEXT NOT NULL,
    "trusted" BOOLEAN NOT NULL DEFAULT false,
    "jobsProcessed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "RunnerKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerKey" (
    "id" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "privateKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerKey_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "RunnerKey" ADD CONSTRAINT "RunnerKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
