"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const db_1 = require("./db");
const storage_1 = require("./storage");
const filetype_1 = require("./validation/filetype");
const probe_1 = require("./validation/probe");
const placement_1 = require("./matchmaking/placement");
const runner_1 = require("./matchmaking/runner");
const client_s3_1 = require("@aws-sdk/client-s3");
const elo_1 = require("./ratings/elo");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const WORKER_ID = `worker-${process.env.HOSTNAME || Math.random().toString(36).substring(7)}`;
async function pollJobs() {
    try {
        const job = await db_1.prisma.$transaction(async (tx) => {
            const pendingJobs = await tx.$queryRawUnsafe(`
        SELECT id FROM "Job"
        WHERE status = 'pending' AND "runAt" <= NOW()
        ORDER BY "runAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `);
            if (!pendingJobs || pendingJobs.length === 0)
                return null;
            const jobId = pendingJobs[0].id;
            return await tx.job.update({
                where: { id: jobId },
                data: {
                    status: db_1.JobStatus.processing,
                    lockedAt: new Date(),
                    workerId: WORKER_ID,
                    attempts: { increment: 1 },
                },
            });
        });
        if (job) {
            console.log(`[${new Date().toISOString()}] Processing job: ${job.jobType} (${job.id})`);
            try {
                await processJob(job);
                await db_1.prisma.job.update({
                    where: { id: job.id },
                    data: { status: db_1.JobStatus.completed, updatedAt: new Date() },
                });
            }
            catch (error) {
                console.error(`[${new Date().toISOString()}] Job failed: ${job.id}`, error);
                await db_1.prisma.job.update({
                    where: { id: job.id },
                    data: {
                        status: db_1.JobStatus.failed,
                        lastError: error.message || String(error),
                        updatedAt: new Date()
                    },
                });
            }
        }
    }
    catch (error) {
        console.error("Error in polling loop:", error);
    }
    setTimeout(pollJobs, 2000);
}
async function processJob(job) {
    switch (job.jobType) {
        case db_1.JobType.submission_validate:
            await handleValidation(job.payloadJson);
            break;
        case db_1.JobType.placement_prepare:
            await handlePlacementPrepare(job.payloadJson);
            break;
        case db_1.JobType.match_run:
            await handleMatchRun(job.payloadJson);
            break;
        case db_1.JobType.rating_apply:
            await handleRatingApply(job.payloadJson);
            break;
        default:
            console.log(`Skipping job type: ${job.jobType}`);
    }
}
async function handleValidation(payload) {
    const { submissionId, versionId, storageKey } = payload;
    // 1. Validate file type from storage key
    const fileType = (0, filetype_1.validateFileType)(storageKey);
    if (!fileType.isValid || !fileType.language) {
        await failSubmission(submissionId, versionId, fileType.error || "Invalid file type");
        return;
    }
    const ext = fileType.language;
    const tempDir = await promises_1.default.mkdtemp(path_1.default.join(os_1.default.tmpdir(), "engine-"));
    const tempPath = path_1.default.join(tempDir, `agent.${ext}`);
    try {
        // 2. Download from R2
        console.log(`Downloading ${storageKey} to ${tempPath}...`);
        const { Body } = await storage_1.storage.send(new client_s3_1.GetObjectCommand({
            Bucket: storage_1.BUCKET_NAME,
            Key: storageKey,
        }));
        if (!Body)
            throw new Error("Empty response from R2");
        const arrayBuffer = await Body.transformToByteArray();
        await promises_1.default.writeFile(tempPath, Buffer.from(arrayBuffer));
        // 3. Probe agent — send FEN, expect legal move
        console.log(`Running FEN probe (${ext})...`);
        const probeResult = await (0, probe_1.probeAgent)(tempPath, ext);
        if (!probeResult.isValid) {
            await failSubmission(submissionId, versionId, probeResult.error || "Agent did not return a valid move");
            return;
        }
        // 4. Success! Update DB
        console.log(`Validation passed for ${storageKey}`);
        await db_1.prisma.$transaction([
            db_1.prisma.engineVersion.update({
                where: { id: versionId },
                data: {
                    validationStatus: db_1.ValidationStatus.passed,
                    validatedAt: new Date(),
                },
            }),
            db_1.prisma.submission.update({
                where: { id: submissionId },
                data: { status: db_1.SubmissionStatus.validated },
            }),
            db_1.prisma.engine.update({
                where: { id: (await db_1.prisma.engineVersion.findUnique({ where: { id: versionId } }))?.engineId },
                data: { status: db_1.EngineStatus.active },
            }),
            // Enqueue placement
            db_1.prisma.job.create({
                data: {
                    jobType: db_1.JobType.placement_prepare,
                    payloadJson: { submissionId, versionId },
                    status: db_1.JobStatus.pending,
                },
            }),
        ]);
    }
    finally {
        try {
            await promises_1.default.rm(tempDir, { recursive: true, force: true });
        }
        catch (e) {
            console.error("Cleanup error:", e);
        }
    }
}
async function handlePlacementPrepare(payload) {
    const { versionId } = payload;
    await (0, placement_1.preparePlacementMatches)(versionId);
}
async function handleMatchRun(payload) {
    const { matchId } = payload;
    const match = await db_1.prisma.match.findUnique({
        where: { id: matchId },
        include: {
            challengerVersion: true,
            defenderVersion: true,
            challengerEngine: true,
            defenderEngine: true,
        }
    });
    if (!match)
        throw new Error("Match not found");
    const tempDir = await promises_1.default.mkdtemp(path_1.default.join(os_1.default.tmpdir(), "match-"));
    // Determine file extensions from storage keys
    const challengerExt = path_1.default.extname(match.challengerVersion.storageKey) || `.${match.challengerVersion.language}`;
    const defenderExt = path_1.default.extname(match.defenderVersion.storageKey) || `.${match.defenderVersion.language}`;
    const pathA = path_1.default.join(tempDir, `agent_a${challengerExt}`);
    const pathB = path_1.default.join(tempDir, `agent_b${defenderExt}`);
    try {
        // 1. Download agents
        console.log(`Downloading agents for match ${matchId}...`);
        await downloadAgent(match.challengerVersion.storageKey, pathA);
        await downloadAgent(match.defenderVersion.storageKey, pathB);
        // 2. Run match
        const result = await (0, runner_1.runMatch)({
            path: pathA,
            language: (match.challengerVersion.language || challengerExt.slice(1)),
            name: match.challengerEngine.name,
        }, {
            path: pathB,
            language: (match.defenderVersion.language || defenderExt.slice(1)),
            name: match.defenderEngine.name,
        }, { games: match.gamesPlanned });
        // 3. Validate score integrity
        const challengerWins = result.games.filter(g => g.result === "1-0").length;
        const defenderWins = result.games.filter(g => g.result === "0-1").length;
        const draws = result.games.filter(g => g.result === "1/2-1/2").length;
        const totalGames = challengerWins + defenderWins + draws;
        if (totalGames !== match.gamesPlanned) {
            throw new Error(`Score integrity check failed: ${totalGames} counted vs ${match.gamesPlanned} expected`);
        }
        const challengerScore = challengerWins + (draws * 0.5);
        const defenderScore = defenderWins + (draws * 0.5);
        // 4. Save PGN to R2
        const pgnKey = `matches/${matchId}/match.pgn`;
        await storage_1.storage.send(new client_s3_1.PutObjectCommand({
            Bucket: storage_1.BUCKET_NAME,
            Key: pgnKey,
            Body: result.pgn,
            ContentType: "application/x-chess-pgn",
        }));
        // 5. Update Match results
        await db_1.prisma.$transaction([
            db_1.prisma.match.update({
                where: { id: matchId },
                data: {
                    status: "completed",
                    completedAt: new Date(),
                    challengerScore,
                    defenderScore,
                    pgnStorageKey: pgnKey,
                }
            }),
            ...result.games.map(g => db_1.prisma.game.create({
                data: {
                    matchId,
                    roundIndex: g.round,
                    whiteEngineId: match.challengerEngineId,
                    blackEngineId: match.defenderEngineId,
                    result: g.result,
                    termination: g.termination,
                    pgnStorageKey: "",
                }
            })),
            db_1.prisma.job.create({
                data: {
                    jobType: db_1.JobType.rating_apply,
                    payloadJson: { matchId },
                    status: db_1.JobStatus.pending,
                }
            })
        ]);
    }
    finally {
        await promises_1.default.rm(tempDir, { recursive: true, force: true });
    }
}
async function handleRatingApply(payload) {
    const { matchId } = payload;
    const match = await db_1.prisma.match.findUnique({
        where: { id: matchId },
        include: {
            challengerEngine: true,
            defenderEngine: true,
        }
    });
    if (!match || match.status !== "completed")
        return;
    // Idempotency check
    const existingRating = await db_1.prisma.rating.findFirst({ where: { matchId } });
    if (existingRating) {
        console.log(`Ratings already applied for match ${matchId}, skipping`);
        return;
    }
    const { deltaA, deltaB } = (0, elo_1.updateRatingsForMatch)(match.challengerEngine.currentRating, match.defenderEngine.currentRating, Number(match.challengerScore), Number(match.defenderScore), match.gamesPlanned);
    await db_1.prisma.$transaction([
        db_1.prisma.engine.update({
            where: { id: match.challengerEngineId },
            data: {
                currentRating: { increment: deltaA },
                gamesPlayed: { increment: match.gamesPlanned },
                wins: { increment: Number(match.challengerScore) === match.gamesPlanned ? 1 : 0 },
                updatedAt: new Date(),
            }
        }),
        db_1.prisma.engine.update({
            where: { id: match.defenderEngineId },
            data: {
                currentRating: { increment: deltaB },
                gamesPlayed: { increment: match.gamesPlanned },
                updatedAt: new Date(),
            }
        }),
        db_1.prisma.rating.create({
            data: {
                engineId: match.challengerEngineId,
                matchId: match.id,
                ratingBefore: match.challengerEngine.currentRating,
                ratingAfter: match.challengerEngine.currentRating + deltaA,
                delta: deltaA,
            }
        }),
        db_1.prisma.rating.create({
            data: {
                engineId: match.defenderEngineId,
                matchId: match.id,
                ratingBefore: match.defenderEngine.currentRating,
                ratingAfter: match.defenderEngine.currentRating + deltaB,
                delta: deltaB,
            }
        })
    ]);
    await updateGlobalRanks();
}
async function updateGlobalRanks() {
    await db_1.prisma.$executeRawUnsafe(`
    UPDATE "Engine" e
    SET "currentRank" = ranked.rank
    FROM (
      SELECT id, ROW_NUMBER() OVER (ORDER BY "currentRating" DESC) as rank
      FROM "Engine"
      WHERE status = 'active'
    ) ranked
    WHERE e.id = ranked.id
  `);
}
async function downloadAgent(key, dest) {
    const { Body } = await storage_1.storage.send(new client_s3_1.GetObjectCommand({
        Bucket: storage_1.BUCKET_NAME,
        Key: key,
    }));
    if (!Body)
        throw new Error(`Failed to download ${key}`);
    const bytes = await Body.transformToByteArray();
    await promises_1.default.writeFile(dest, Buffer.from(bytes));
}
async function failSubmission(submissionId, versionId, reason) {
    console.log(`Validation failed: ${reason}`);
    await db_1.prisma.$transaction([
        db_1.prisma.engineVersion.update({
            where: { id: versionId },
            data: {
                validationStatus: db_1.ValidationStatus.failed,
                validationNotes: reason,
            },
        }),
        db_1.prisma.submission.update({
            where: { id: submissionId },
            data: {
                status: db_1.SubmissionStatus.rejected,
                rejectionReason: reason,
            },
        }),
    ]);
}
console.log(`Chess Agents Worker started with ID: ${WORKER_ID}`);
pollJobs();
