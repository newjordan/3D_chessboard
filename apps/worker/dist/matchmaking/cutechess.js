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
const execAsync = (0, util_1.promisify)(child_process_1.exec);
/**
 * Runs a chess match between two engines using cutechess-cli inside Docker.
 */
async function runMatch(engineAPath, engineBPath, options) {
    // 1. Prepare Docker execution
    // Note: We mount the host temp paths into the container.
    // This assumes engineAPath and engineBPath are inside the same temp directory.
    const tempDir = path_1.default.dirname(engineAPath);
    const engineAFile = path_1.default.basename(engineAPath);
    const engineBFile = path_1.default.basename(engineBPath);
    const dockerCommand = [
        "docker run --rm",
        "--network none",
        "--security-opt no-new-privileges",
        `--mount type=bind,source="${tempDir}",target=/home/chessrunner/work,readonly`,
        "chess-engine-runner:latest",
        "cutechess-cli",
        `-engine name=EngineA cmd=/home/chessrunner/work/${engineAFile}`,
        `-engine name=EngineB cmd=/home/chessrunner/work/${engineBFile}`,
        `-each tc=${options.tc}`,
        `-rounds ${options.games}`,
        "-repeat",
        "-pgnout /home/chessrunner/work/match.pgn",
    ].join(" ");
    console.log(`Executing match: ${dockerCommand}`);
    try {
        const { stdout, stderr } = await execAsync(dockerCommand);
        console.log("Match output:", stdout);
        // 2. Read and parse PGN
        const pgnPath = path_1.default.join(tempDir, "match.pgn");
        const pgn = await promises_1.default.readFile(pgnPath, "utf-8");
        // 3. Simple parsing of results from stdout or PGN
        // In a production app, we'd use a real PGN parser.
        const games = parseMatchResults(stdout);
        return { games, pgn };
    }
    catch (error) {
        console.error("Match failed:", error.stderr || error.message);
        throw new Error(`Match execution failed: ${error.message}`);
    }
}
function parseMatchResults(stdout) {
    const games = [];
    const lines = stdout.split("\n");
    // Example line: Finished game 1 (EngineA vs EngineB): 1-0 {White mates}
    const resultRegex = /Finished game (\d+) \((.+) vs (.+)\): (\d-\d|1\/2-1\/2) \{(.+)\}/;
    for (const line of lines) {
        const match = line.match(resultRegex);
        if (match) {
            games.push({
                round: parseInt(match[1]),
                white: match[2],
                black: match[3],
                result: match[4],
                termination: match[5],
            });
        }
    }
    return games;
}
