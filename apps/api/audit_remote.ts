import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
import path from "path";

// Load .env from workspace root
dotenv.config({ path: path.join(__dirname, "../../.env") });

const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

const BUCKET_NAME = process.env.R2_BUCKET || "jdevservices";

async function auditMatch(matchId: string, pgnKey: string) {
  console.log(`Auditing Match: ${matchId}`);
  console.log(`PGN Key: ${pgnKey}`);

  try {
    const { Body } = await s3Client.send(new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: pgnKey,
    }));

    if (!Body) throw new Error("PGN not found in storage");

    const pgnContent = await (Body as any).transformToString();
    console.log("--- PGN PREVIEW (First 200 chars) ---");
    console.log(pgnContent.substring(0, 200));
    console.log("-------------------------------------");

    // Simple validation: Look for Result tags
    const results = pgnContent.match(/\[Result "(.*?)"\]/g);
    console.log(`Games found in PGN: ${results ? results.length : 0}`);
    console.log(`Results: ${results}`);

  } catch (err) {
    console.error("Audit failed:", err);
  }
}

auditMatch(
  "11cbe47b-3200-4a70-a4a6-566109e10f45", 
  "matches/11cbe47b-3200-4a70-a4a6-566109e10f45/match.pgn"
);
