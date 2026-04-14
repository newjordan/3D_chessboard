import dotenv from "dotenv";
dotenv.config();

import fs from "fs/promises";
import path from "path";
import os from "os";
import { hashData, signData, verifyData, publicKeyFromPrivate, decryptFromServer } from "./crypto";
import { runMatch } from "./matchmaking/runner";

const API_URL = (process.env.API_URL || "http://localhost:3001").replace(/\/$/, "");
const WORKER_PRIVATE_KEY = process.env.WORKER_PRIVATE_KEY || "";
let WORKER_PUBLIC_KEY = "";
const POLL_INTERVAL_MS = 2000;

let serverPublicKey = "";

async function fetchServerPublicKey(): Promise<void> {
  const res = await fetch(`${API_URL}/api/public-key`);
  if (!res.ok) throw new Error("Failed to fetch server public key");
  const data = await res.json() as { publicKey: string };
  serverPublicKey = data.publicKey;
  console.log("[BrokerRunner] Server public key loaded.");
}

function buildSigningString(endpoint: "next-jobs" | "submit", fields: Record<string, any>): string {
  if (endpoint === "next-jobs") return `next-jobs:${fields.count}`;
  if (endpoint === "submit") return `submit:${fields.jobId}:${fields.matchId}`;
  return "";
}

async function signedPost(endpoint: string, body: object): Promise<Response> {
  const endpointKey = endpoint.includes("next-jobs") ? "next-jobs" : "submit";
  const signingString = buildSigningString(endpointKey as any, body);
  const signature = signData(signingString, WORKER_PRIVATE_KEY);

  return fetch(`${API_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-worker-public-key": WORKER_PUBLIC_KEY,
      "x-worker-signature": signature,
    },
    body: JSON.stringify(body),
  });
}

async function verifyJobIntegrity(job: any): Promise<boolean> {
  // Engine code is obfuscated in transit — verify the server's Ed25519 signature
  // which covers (matchId + challengerHash + defenderHash) of the original source.
  const signingString = job.matchId + job.challengerHash + job.defenderHash;
  if (!verifyData(signingString, job.serverSignature, serverPublicKey)) {
    console.error(`[BrokerRunner] Server signature invalid for match ${job.matchId}. Rejecting.`);
    return false;
  }

  return true;
}

async function processJob(job: any): Promise<void> {
  console.log(`[BrokerRunner] Running match ${job.matchId}...`);

  const valid = await verifyJobIntegrity(job);
  if (!valid) {
    console.error(`[BrokerRunner] Skipping match ${job.matchId} — integrity check failed.`);
    return;
  }

  // Decrypt engine code if the server used per-arbiter RSA encryption
  let challengerCode = job.challenger.code as string;
  let defenderCode = job.defender.code as string;
  if (job.encrypted) {
    challengerCode = decryptFromServer(challengerCode, WORKER_PRIVATE_KEY);
    defenderCode = decryptFromServer(defenderCode, WORKER_PRIVATE_KEY);
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "broker-match-"));
  const challengerExt = job.challenger.language === "py" ? ".py" : ".mjs";
  const defenderExt = job.defender.language === "py" ? ".py" : ".mjs";
  const pathA = path.join(tempDir, `agent_a${challengerExt}`);
  const pathB = path.join(tempDir, `agent_b${defenderExt}`);

  try {
    await fs.writeFile(pathA, challengerCode);
    await fs.writeFile(pathB, defenderCode);

    const result = await runMatch(
      { path: pathA, language: job.challenger.language, name: job.challenger.name },
      { path: pathB, language: job.defender.language, name: job.defender.name },
      { games: job.gamesPlanned }
    );

    let challengerWins = 0, defenderWins = 0, draws = 0;
    for (const g of result.games) {
      const isChallengerWhite = g.round % 2 !== 0;
      if (g.result === "1-0") { isChallengerWhite ? challengerWins++ : defenderWins++; }
      else if (g.result === "0-1") { isChallengerWhite ? defenderWins++ : challengerWins++; }
      else if (g.result === "1/2-1/2") { draws++; }
    }

    const challengerScore = challengerWins + draws * 0.5;
    const defenderScore = defenderWins + draws * 0.5;

    const submitRes = await signedPost("/api/broker/submit", {
      jobId: job.jobId,
      matchId: job.matchId,
      pgn: result.pgn,
      result: challengerScore > defenderScore ? "challenger" : defenderScore > challengerScore ? "defender" : "draw",
      challengerScore,
      defenderScore,
    });

    if (!submitRes.ok) {
      const err = await submitRes.json().catch(() => ({})) as any;
      console.error(`[BrokerRunner] Submit failed for ${job.matchId}: ${err.error || submitRes.status}`);
    } else {
      console.log(`[BrokerRunner] Match ${job.matchId} submitted. Score: ${challengerScore}-${defenderScore}`);
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function pollBrokerJobs(): Promise<void> {
  try {
    const res = await signedPost("/api/broker/next-jobs", { count: 1 });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as any;
      console.error(`[BrokerRunner] Failed to fetch jobs: ${err.error || res.status}`);
    } else {
      const jobs = await res.json() as any[];
      for (const job of jobs) {
        await processJob(job);
      }
    }
  } catch (err) {
    console.error("[BrokerRunner] Poll error:", err);
  }

  setTimeout(pollBrokerJobs, POLL_INTERVAL_MS);
}

export async function startBrokerRunner(): Promise<void> {
  if (!WORKER_PRIVATE_KEY) {
    throw new Error("WORKER_PRIVATE_KEY env var required for public mode");
  }

  try {
    WORKER_PUBLIC_KEY = publicKeyFromPrivate(WORKER_PRIVATE_KEY);
  } catch {
    throw new Error("WORKER_PRIVATE_KEY is invalid — check that you pasted the full PEM including headers");
  }

  console.log("[BrokerRunner] Starting community runner mode...");
  console.log(`[BrokerRunner] Identity: ${WORKER_PUBLIC_KEY.slice(27, 60)}...`);
  await fetchServerPublicKey();
  pollBrokerJobs();
}
