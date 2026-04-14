CREATE TYPE "Division" AS ENUM ('open', 'js', 'python', 'lite');
ALTER TABLE "Engine" ADD COLUMN "division" "Division" NOT NULL DEFAULT 'open';
