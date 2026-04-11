"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const db_1 = require("db");
const storage_1 = require("./storage");
const elf_1 = require("./validation/elf");
const uci_1 = require("./validation/uci");
const placement_1 = require("./matchmaking/placement");
const cutechess_1 = require("./matchmaking/cutechess");
const client_s3_1 = require("@aws-sdk/client-s3");
const elo_1 = require("./ratings/elo");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const fs_1 = require("fs");
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
    // Poll again after a delay
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
    const tempDir = await promises_1.default.mkdtemp(path_1.default.join(os_1.default.tmpdir(), "engine-"));
    const tempPath = path_1.default.join(tempDir, "engine_bin");
    try {
        // 1. Download from R2
        console.log(`Downloading ${storageKey} to ${tempPath}...`);
        const { Body } = await storage_1.storage.send(new client_s3_1.GetObjectCommand({
            Bucket: storage_1.BUCKET_NAME,
            Key: storageKey,
        }));
        if (!Body)
            throw new Error("Empty response from R2");
        const arrayBuffer = await Body.transformToByteArray();
        await promises_1.default.writeFile(tempPath, Buffer.from(arrayBuffer));
        // 2. Set executable permissions
        (0, fs_1.chmodSync)(tempPath, 0o755);
        // 3. Static check (ELF)
        console.log("Running ELF header check...");
        const staticCheck = await (0, elf_1.validateElfHeader)(tempPath);
        if (!staticCheck.isValid) {
            await failSubmission(submissionId, versionId, staticCheck.error || "Invalid ELF header");
            return;
        }
        // 4. Dynamic check (UCI Probe)
        console.log("Running UCI handshake probe...");
        const uciCheck = await (0, uci_1.probeUci)(tempPath);
        if (!uciCheck.isUci) {
            await failSubmission(submissionId, versionId, uciCheck.error || "Binary does not speak UCI protocol");
            return;
        }
        // 5. Success! Update DB
        console.log(`Validation passed: ${uciCheck.name} by ${uciCheck.author}`);
        await db_1.prisma.$transaction([
            db_1.prisma.engineVersion.update({
                where: { id: versionId },
                data: {
                    validationStatus: db_1.ValidationStatus.passed,
                    validatedAt: new Date(),
                    uciName: uciCheck.name,
                    uciAuthor: uciCheck.author,
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
        // Cleanup
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
        }
    });
    if (!match)
        throw new Error("Match not found");
    const tempDir = await promises_1.default.mkdtemp(path_1.default.join(os_1.default.tmpdir(), "match-"));
    const pathA = path_1.default.join(tempDir, "engine_a");
    const pathB = path_1.default.join(tempDir, "engine_b");
    try {
        // 1. Download binaries
        console.log(`Downloading engines for match ${matchId}...`);
        await downloadBinary(match.challengerVersion.storageKey, pathA);
        await downloadBinary(match.defenderVersion.storageKey, pathB);
        (0, fs_1.chmodSync)(pathA, 0o755);
        (0, fs_1.chmodSync)(pathB, 0o755);
        // 2. Run match
        const result = await (0, cutechess_1.runMatch)(pathA, pathB, {
            games: match.gamesPlanned,
            tc: "40/60" // 1 minute per 40 moves
        });
        // 3. Save PGN to R2
        const pgnKey = `matches/${matchId}/match.pgn`;
        await storage_1.storage.send(new client_s3_1.PutObjectCommand({
            Bucket: storage_1.BUCKET_NAME,
            Key: pgnKey,
            Body: result.pgn,
            ContentType: "application/x-chess-pgn",
        }));
        // 4. Update Match results
        const challengerWins = result.games.filter(g => g.result === "1-0").length;
        const defenderWins = result.games.filter(g => g.result === "0-1").length;
        const draws = result.games.filter(g => g.result === "1/2-1/2").length;
        await db_1.prisma.$transaction([
            db_1.prisma.match.update({
                where: { id: matchId },
                data: {
                    status: "completed",
                    completedAt: new Date(),
                    challengerScore: challengerWins + (draws * 0.5),
                    defenderScore: defenderWins + (draws * 0.5),
                    pgnStorageKey: pgnKey,
                }
            }),
            // Create Game records
            ...result.games.map(g => db_1.prisma.game.create({
                data: {
                    matchId,
                    roundIndex: g.round,
                    whiteEngineId: match.challengerEngineId,
                    blackEngineId: match.defenderEngineId,
                    result: g.result,
                    pgnStorageKey: "",
                }
            })),
            // Enqueue Rating Update
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
    // 1. Calculate Elo Change
    const { deltaA, deltaB } = (0, elo_1.updateRatingsForMatch)(match.challengerEngine.currentRating, match.defenderEngine.currentRating, Number(match.challengerScore), Number(match.defenderScore), match.gamesPlanned);
    // 2. Update Engines and Ratings
    await db_1.prisma.$transaction([
        db_1.prisma.engine.update({
            where: { id: match.challengerEngineId },
            data: {
                currentRating: { increment: deltaA },
                gamesPlayed: { increment: match.gamesPlanned },
                wins: { increment: Number(match.challengerScore) === match.gamesPlanned ? 1 : 0 }, // Simplified record
                // Note: For record, we should ideally count games. For now keep it simple.
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
    // 3. Recalculate Global Ranks
    await updateGlobalRanks();
}
async function updateGlobalRanks() {
    const engines = await db_1.prisma.engine.findMany({
        where: { status: db_1.EngineStatus.active },
        orderBy: { currentRating: "desc" },
    });
    for (let i = 0; i < engines.length; i++) {
        await db_1.prisma.engine.update({
            where: { id: engines[i].id },
            data: { currentRank: i + 1 },
        });
    }
}
async function downloadBinary(key, dest) {
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
console.log(`Chess Ladder Worker started with ID: ${WORKER_ID}`);
pollJobs();
