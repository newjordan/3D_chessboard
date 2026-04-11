"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMatch = runMatch;
const child_process_1 = require("child_process");
const util_1 = require("util");
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
const VALID_TC_REGEX = /^\d+\/\d+$/;
const MAX_GAMES = 100;
/**
 * Runs a chess match between two engines using cutechess-cli inside Docker.
 */
async function runMatch(engineAPath, engineBPath, options) {
    // Validate inputs to prevent injection
    if (!VALID_TC_REGEX.test(options.tc)) {
        throw new Error(`Invalid time control format: ${options.tc}`);
    }
    if (!Number.isInteger(options.games) || options.games < 1 || options.games > MAX_GAMES) {
        throw new Error(`Invalid game count: ${options.games}`);
    }
    const tempDir = path_1.default.dirname(engineAPath);
    const engineAFile = path_1.default.basename(engineAPath);
    const engineBFile = path_1.default.basename(engineBPath);
    // Validate filenames are safe (alphanumeric, underscores, hyphens, dots only)
    const SAFE_FILENAME = /^[a-zA-Z0-9._-]+$/;
    if (!SAFE_FILENAME.test(engineAFile) || !SAFE_FILENAME.test(engineBFile)) {
        throw new Error("Invalid engine filename");
    }
    // Use execFile (no shell) to prevent command injection
    const args = [
        "run", "--rm",
        "--network", "none",
        "--security-opt", "no-new-privileges",
        "--memory", "512m",
        "--cpus", "1",
        "--mount", `type=bind,source=${tempDir},target=/home/chessrunner/work,readonly`,
        "chess-engine-runner:latest",
        "cutechess-cli",
        "-engine", `name=EngineA`, `cmd=/home/chessrunner/work/${engineAFile}`,
        "-engine", `name=EngineB`, `cmd=/home/chessrunner/work/${engineBFile}`,
        "-each", `tc=${options.tc}`,
        "-rounds", `${options.games}`,
        "-repeat",
        "-pgnout", "/home/chessrunner/work/match.pgn",
    ];
    console.log(`Executing match via Docker (${options.games} games, tc=${options.tc})`);
    try {
        const { stdout, stderr } = await execFileAsync("docker", args, {
            timeout: 10 * 60 * 1000, // 10 minute timeout
        });
        console.log("Match output:", stdout);
        // Read and parse PGN
        const pgnPath = path_1.default.join(tempDir, "match.pgn");
        const pgn = await promises_1.default.readFile(pgnPath, "utf-8");
        // Parse results from stdout
        const games = parseMatchResults(stdout);
        // Validate parsed game count matches expected
        if (games.length !== options.games) {
            throw new Error(`Expected ${options.games} games but parsed ${games.length}`);
        }
        return { games, pgn };
    }
    catch (error) {
        console.error("Match failed:", error.stderr || error.message);
        throw new Error(`Match execution failed: ${error.message}`);
    }
}
const VALID_RESULTS = new Set(["1-0", "0-1", "1/2-1/2"]);
function parseMatchResults(stdout) {
    const games = [];
    const lines = stdout.split("\n");
    // Example line: Finished game 1 (EngineA vs EngineB): 1-0 {White mates}
    const resultRegex = /Finished game (\d+) \((.+) vs (.+)\): (\d-\d|1\/2-1\/2) \{(.+)\}/;
    for (const line of lines) {
        const match = line.match(resultRegex);
        if (match) {
            const result = match[4];
            if (!VALID_RESULTS.has(result)) {
                throw new Error(`Invalid game result: ${result}`);
            }
            games.push({
                round: parseInt(match[1]),
                white: match[2],
                black: match[3],
                result: result,
                termination: match[5],
            });
        }
    }
    return games;
}
