import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";

const execAsync = promisify(exec);

export interface MatchResult {
  games: GameResult[];
  pgn: string;
}

export interface GameResult {
  round: number;
  white: string;
  black: string;
  result: "1-0" | "0-1" | "1/2-1/2";
  termination: string;
}

/**
 * Runs a chess match between two engines using cutechess-cli inside Docker.
 */
export async function runMatch(
  engineAPath: string,
  engineBPath: string,
  options: {
    games: number;
    tc: string; // Time control, e.g., "40/60"
  }
): Promise<MatchResult> {
  // 1. Prepare Docker execution
  // Note: We mount the host temp paths into the container.
  // This assumes engineAPath and engineBPath are inside the same temp directory.
  const tempDir = path.dirname(engineAPath);
  const engineAFile = path.basename(engineAPath);
  const engineBFile = path.basename(engineBPath);

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
    const pgnPath = path.join(tempDir, "match.pgn");
    const pgn = await fs.readFile(pgnPath, "utf-8");

    // 3. Simple parsing of results from stdout or PGN
    // In a production app, we'd use a real PGN parser.
    const games = parseMatchResults(stdout);

    return { games, pgn };
  } catch (error: any) {
    console.error("Match failed:", error.stderr || error.message);
    throw new Error(`Match execution failed: ${error.message}`);
  }
}

function parseMatchResults(stdout: string): GameResult[] {
  const games: GameResult[] = [];
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
        result: match[4] as any,
        termination: match[5],
      });
    }
  }

  return games;
}
