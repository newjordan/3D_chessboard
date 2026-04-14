"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const db_1 = require("./db");
const storage_1 = require("./storage");
const filetype_1 = require("./validation/filetype");
const StaticAnalyzer_1 = require("./validation/StaticAnalyzer");
const probe_1 = require("./validation/probe");
const placement_1 = require("./matchmaking/placement");
const scheduler_1 = require("./matchmaking/scheduler");
const runner_1 = require("./matchmaking/runner");
const client_s3_1 = require("@aws-sdk/client-s3");
const elo_1 = require("./ratings/elo");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const notifications_1 = require("./notifications");
const WORKER_ID = `worker-${process.env.HOSTNAME || Math.random().toString(36).substring(7)}`;
async function pollJobs() {
    try {
        const job = await db_1.prisma.$transaction(async (tx) => {
            const matchExclusion = process.env.ENABLE_MATCH_RUN === 'true' ? '' : 'AND "jobType" != \'match_run\'';
            const pendingJobs = await tx.$queryRawUnsafe(`
        SELECT id FROM "Job"
        WHERE status = 'pending' AND "runAt" <= NOW()
        ${matchExclusion}
        ORDER BY 
          CASE 
            WHEN "jobType" = 'rating_apply' THEN 0
            WHEN "jobType" = 'submission_validate' THEN 1
            ELSE 2 
          END ASC, 
          "runAt" ASC
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
const SCHEDULER_INTERVAL_MS = 30_000;
async function pollScheduler() {
    try {
        const scheduled = await (0, scheduler_1.scheduleMatches)();
        if (scheduled > 0) {
            console.log(`[${new Date().toISOString()}] Scheduler queued ${scheduled} new match(es)`);
        }
    }
    catch (error) {
        console.error("Scheduler error:", error);
    }
    setTimeout(pollScheduler, SCHEDULER_INTERVAL_MS);
}
const REAPER_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
async function pollReaper() {
    try {
        const reapedCount = await (0, scheduler_1.reapStaleJobs)();
        if (reapedCount > 0) {
            console.log(`[${new Date().toISOString()}] Reaper identified and recovered ${reapedCount} stale job(s).`);
        }
    }
    catch (error) {
        console.error("Reaper error:", error);
    }
    setTimeout(pollReaper, REAPER_INTERVAL_MS);
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
        // 3. Static Analysis — Check for forbidden modules/keywords
        console.log(`Analyzing code (${ext})...`);
        const analysisResult = await (0, StaticAnalyzer_1.analyzeStatic)(tempPath, ext);
        if (!analysisResult.isValid) {
            await failSubmission(submissionId, versionId, analysisResult.error || "Security violation detected");
            return;
        }
        // 4. Probe agent — send FEN, expect legal move
        console.log(`Running FEN probe (${ext})...`);
        const probeResult = await (0, probe_1.probeAgent)(tempPath, ext);
        if (!probeResult.isValid) {
            await failSubmission(submissionId, versionId, probeResult.error || "Agent did not return a valid move");
            return;
        }
        // 5. Success! Update DB
        console.log(`Validation passed for ${storageKey}`);
        const version = await db_1.prisma.engineVersion.findUnique({
            where: { id: versionId },
            include: { engine: true }
        });
        if (!version)
            return;
        const ownerUserId = version.engine.ownerUserId;
        const activeCount = await db_1.prisma.engine.count({
            where: { ownerUserId, status: db_1.EngineStatus.active }
        });
        const shouldActivate = activeCount < 5;
        const targetStatus = shouldActivate ? db_1.EngineStatus.active : db_1.EngineStatus.disabled_by_owner;
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
                where: { id: version.engineId },
                data: { status: targetStatus },
            }),
            ...(shouldActivate ? [
                db_1.prisma.job.create({
                    data: {
                        jobType: db_1.JobType.placement_prepare,
                        payloadJson: { submissionId, versionId },
                        status: db_1.JobStatus.pending,
                    },
                })
            ] : []),
        ]);
        // Send notification for new engine join
        try {
            const engineWithUser = await db_1.prisma.engine.findUnique({
                where: { id: (await db_1.prisma.engineVersion.findUnique({ where: { id: versionId } }))?.engineId },
                include: { owner: true }
            });
            if (engineWithUser) {
                await (0, notifications_1.notifyEngineValidated)(engineWithUser, engineWithUser.owner);
            }
        }
        catch (err) {
            console.error("Failed to fetch engine info for notification:", err);
        }
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
    // Send notification for match starting
    await (0, notifications_1.notifyMatchStarted)(match);
    const tempDir = await promises_1.default.mkdtemp(path_1.default.join(os_1.default.tmpdir(), "match-"));
    // Determine file extensions from storage keys
    const challengerExt = path_1.default.extname(match.challengerVersion.storageKey) || `.${match.challengerVersion.language}`;
    const defenderExt = path_1.default.extname(match.defenderVersion.storageKey) || `.${match.defenderVersion.language}`;
    const pathA = path_1.default.join(tempDir, `agent_a${challengerExt}`);
    const pathB = path_1.default.join(tempDir, `agent_b${defenderExt}`);
    try {
        // Set match to running status so it shows up in UI
        await db_1.prisma.match.update({
            where: { id: matchId },
            data: {
                status: db_1.MatchStatus.running,
                processedBy: WORKER_ID
            }
        });
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
        }, {
            games: match.gamesPlanned,
            onGameComplete: async (round, res, term) => {
                await (0, notifications_1.notifyGameResult)(match, round, res, term);
            }
        });
        // 3. Validate score integrity
        let challengerWins = 0;
        let defenderWins = 0;
        let draws = 0;
        for (const g of result.games) {
            const isChallengerWhite = g.round % 2 !== 0;
            if (g.result === "1-0") {
                if (isChallengerWhite)
                    challengerWins++;
                else
                    defenderWins++;
            }
            else if (g.result === "0-1") {
                if (!isChallengerWhite)
                    challengerWins++;
                else
                    defenderWins++;
            }
            else if (g.result === "1/2-1/2") {
                draws++;
            }
        }
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
        // Determine winnerEngineId
        let winnerEngineId = null;
        if (challengerScore > defenderScore) {
            winnerEngineId = match.challengerEngineId;
        }
        else if (defenderScore > challengerScore) {
            winnerEngineId = match.defenderEngineId;
        }
        // 5. Update Match results
        await db_1.prisma.$transaction([
            db_1.prisma.match.update({
                where: { id: matchId },
                data: {
                    status: "completed",
                    completedAt: new Date(),
                    challengerScore,
                    defenderScore,
                    gamesCompleted: totalGames,
                    winnerEngineId,
                    pgnStorageKey: pgnKey,
                    processedBy: WORKER_ID
                }
            }),
            ...result.games.map(g => {
                const isChallengerWhite = g.round % 2 !== 0; // Odd rounds: Challenger is White
                return db_1.prisma.game.create({
                    data: {
                        matchId,
                        roundIndex: g.round,
                        whiteEngineId: isChallengerWhite ? match.challengerEngineId : match.defenderEngineId,
                        blackEngineId: isChallengerWhite ? match.defenderEngineId : match.challengerEngineId,
                        result: g.result,
                        termination: g.termination,
                        pgnStorageKey: "",
                    }
                });
            }),
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
    // Dynamic K-Factor Logic
    // - New engines (< 30 games): K=40 (Placement boost)
    // - Established masters (> 2400): K=16 (Stability)
    // - Default: K=32
    const getKFactor = (engine) => {
        if (engine.gamesPlayed < 30)
            return 40;
        if (engine.currentRating > 2400)
            return 16;
        return 32;
    };
    const kA = getKFactor(match.challengerEngine);
    const kB = getKFactor(match.defenderEngine);
    const { deltaA, deltaB } = (0, elo_1.updateRatingsForMatch)(match.challengerEngine.currentRating, match.defenderEngine.currentRating, Number(match.challengerScore || 0), Number(match.defenderScore || 0), match.gamesPlanned, kA, kB);
    // Calculate detailed stats from individual games
    const games = await db_1.prisma.game.findMany({ where: { matchId } });
    let challengerWins = 0;
    let defenderWins = 0;
    let draws = 0;
    for (const game of games) {
        if (game.result === "1-0") {
            if (game.whiteEngineId === match.challengerEngineId)
                challengerWins++;
            else
                defenderWins++;
        }
        else if (game.result === "0-1") {
            if (game.blackEngineId === match.challengerEngineId)
                challengerWins++;
            else
                defenderWins++;
        }
        else if (game.result === "1/2-1/2") {
            draws++;
        }
    }
    await db_1.prisma.$transaction([
        db_1.prisma.engine.update({
            where: { id: match.challengerEngineId },
            data: {
                currentRating: { increment: deltaA },
                gamesPlayed: { increment: match.gamesPlanned },
                wins: { increment: challengerWins },
                losses: { increment: defenderWins },
                draws: { increment: draws },
                updatedAt: new Date(),
            }
        }),
        db_1.prisma.engine.update({
            where: { id: match.defenderEngineId },
            data: {
                currentRating: { increment: deltaB },
                gamesPlayed: { increment: match.gamesPlanned },
                wins: { increment: defenderWins },
                losses: { increment: challengerWins },
                draws: { increment: draws },
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
    // Send result notification
    await (0, notifications_1.notifyMatchResult)(match, deltaA, deltaB, challengerWins, defenderWins, draws);
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
const isPublicMode = process.argv.includes("--mode") &&
    process.argv[process.argv.indexOf("--mode") + 1] === "public";
if (isPublicMode) {
    Promise.resolve().then(() => __importStar(require("./broker-runner"))).then(({ startBrokerRunner }) => {
        startBrokerRunner().catch((err) => {
            console.error("[Worker] Failed to start broker runner:", err);
            process.exit(1);
        });
    });
}
else {
    const ROLES = (process.env.WORKER_ROLE || "all").toLowerCase().split(",");
    console.log(`Chess Agents Arbiter started with ID: ${WORKER_ID}`);
    console.log(`Assigned Roles: ${ROLES.join(", ")}`);
    if (ROLES.includes("all") || ROLES.includes("arbiter")) {
        pollJobs();
    }
    if (ROLES.includes("all") || ROLES.includes("scheduler")) {
        pollScheduler();
    }
    if (ROLES.includes("all") || ROLES.includes("reaper")) {
        pollReaper();
    }
}
