import dotenv from "dotenv";
dotenv.config();

import fs from "fs/promises";
import path from "path";
import os from "os";
import { hashData, signData, verifyData } from "./crypto";
import { runMatch } from "./matchmaking/runner";

const API_URL = (process.env.API_URL || "http://localhost:3001").replace(/\/$/, "");
const WORKER_PUBLIC_KEY = process.env.WORKER_PUBLIC_KEY || "";
const WORKER_PRIVATE_KEY = process.env.WORKER_PRIVATE_KEY || "";
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
  const challengerHash = hashData(job.challenger.code);
  const defenderHash = hashData(job.defender.code);

  if (challengerHash !== job.challengerHash) {
    console.error(`[BrokerRunner] Challenger code hash mismatch for match ${job.matchId}. Possible tamper!`);
    return false;
  }

  if (defenderHash !== job.defenderHash) {
    console.error(`[BrokerRunner] Defender code hash mismatch for match ${job.matchId}. Possible tamper!`);
    return false;
  }

  const signingString = job.matchId + job.challengerHash + job.defenderHash;
  if (!verifyData(signingString, job.serverSignature, serverPublicKey)) {
    console.error(`[BrokerRunner] Server signature invalid for match ${job.matchId}. Possible tamper!`);
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

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "broker-match-"));
  const challengerExt = job.challenger.language === "py" ? ".py" : ".js";
  const defenderExt = job.defender.language === "py" ? ".py" : ".js";
  const pathA = path.join(tempDir, `agent_a${challengerExt}`);
  const pathB = path.join(tempDir, `agent_b${defenderExt}`);

  try {
    await fs.writeFile(pathA, job.challenger.code);
    await fs.writeFile(pathB, job.defender.code);

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
  if (!WORKER_PUBLIC_KEY || !WORKER_PRIVATE_KEY) {
    throw new Error("WORKER_PUBLIC_KEY and WORKER_PRIVATE_KEY env vars required for public mode");
  }

  console.log("[BrokerRunner] Starting community runner mode...");
  await fetchServerPublicKey();
  pollBrokerJobs();
}
