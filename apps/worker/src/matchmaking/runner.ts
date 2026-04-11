import { spawn } from "child_process";
import { Chess } from "chess.js";

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
  pgn: string;
}

export interface AgentConfig {
  path: string;
  language: "js" | "py";
  name: string;
}

const MOVE_REGEX = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const MAX_PLIES = 500;
const MOVE_TIMEOUT_MS = 5000;

/**
 * Runs a multi-game match between two agents.
 * Alternates colors each game.
 */
export async function runMatch(
  agentA: AgentConfig,
  agentB: AgentConfig,
  options: { games: number }
): Promise<MatchResult> {
  const results: GameResult[] = [];
  const allPgns: string[] = [];

  for (let round = 1; round <= options.games; round++) {
    const white = round % 2 === 1 ? agentA : agentB;
    const black = round % 2 === 1 ? agentB : agentA;

    console.log(`  Game ${round}/${options.games}: ${white.name} (W) vs ${black.name} (B)`);

    const gameResult = await runGame(white, black, round);
    results.push(gameResult);
    allPgns.push(gameResult.pgn);

    console.log(`  Result: ${gameResult.result} (${gameResult.termination})`);
  }

  return {
    games: results,
    pgn: allPgns.join("\n\n"),
  };
}

async function runGame(
  white: AgentConfig,
  black: AgentConfig,
  round: number
): Promise<GameResult> {
  const chess = new Chess();
  let termination = "normal";

  while (!chess.isGameOver() && chess.moveNumber() <= MAX_PLIES) {
    const currentAgent = chess.turn() === "w" ? white : black;
    const fen = chess.fen();

    let move: string;
    try {
      move = await getAgentMove(currentAgent, fen);
    } catch (err: any) {
      const loserColor = chess.turn();
      termination = err.message || "agent error";
      return {
        round,
        white: white.name,
        black: black.name,
        result: loserColor === "w" ? "0-1" : "1-0",
        termination,
        pgn: buildPgn(chess, white.name, black.name, round, loserColor === "w" ? "0-1" : "1-0", termination),
      };
    }

    if (!MOVE_REGEX.test(move)) {
      const loserColor = chess.turn();
      termination = `invalid move format: ${move}`;
      return {
        round,
        white: white.name,
        black: black.name,
        result: loserColor === "w" ? "0-1" : "1-0",
        termination,
        pgn: buildPgn(chess, white.name, black.name, round, loserColor === "w" ? "0-1" : "1-0", termination),
      };
    }

    const moveResult = chess.move({
      from: move.slice(0, 2),
      to: move.slice(2, 4),
      promotion: (move[4] as any) || undefined,
    });

    if (!moveResult) {
      const loserColor = chess.turn();
      termination = `illegal move: ${move}`;
      return {
        round,
        white: white.name,
        black: black.name,
        result: loserColor === "w" ? "0-1" : "1-0",
        termination,
        pgn: buildPgn(chess, white.name, black.name, round, loserColor === "w" ? "0-1" : "1-0", termination),
      };
    }
  }

  let result: "1-0" | "0-1" | "1/2-1/2";
  if (chess.isCheckmate()) {
    result = chess.turn() === "w" ? "0-1" : "1-0";
    termination = "checkmate";
  } else if (chess.isDraw()) {
    result = "1/2-1/2";
    if (chess.isStalemate()) termination = "stalemate";
    else if (chess.isThreefoldRepetition()) termination = "threefold repetition";
    else if (chess.isInsufficientMaterial()) termination = "insufficient material";
    else termination = "50-move rule";
  } else {
    result = "1/2-1/2";
    termination = "max plies reached";
  }

  return {
    round,
    white: white.name,
    black: black.name,
    result,
    termination,
    pgn: buildPgn(chess, white.name, black.name, round, result, termination),
  };
}

/**
 * Spawns an agent process, sends FEN, reads move.
 */
function getAgentMove(agent: AgentConfig, fen: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let completed = false;
    const runtime = agent.language === "js" ? "node" : "python3";

    const child = spawn(runtime, [agent.path], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { PATH: process.env.PATH },
    });

    const timeout = setTimeout(() => {
      if (!completed) {
        completed = true;
        child.kill("SIGKILL");
        reject(new Error("move timeout"));
      }
    }, MOVE_TIMEOUT_MS);

    child.on("error", (err) => {
      if (!completed) {
        completed = true;
        clearTimeout(timeout);
        reject(new Error(`spawn error: ${err.message}`));
      }
    });

    let stdout = "";
    child.stdout.on("data", (data) => {
      stdout += data.toString();
      if (!completed && stdout.includes("\n")) {
        completed = true;
        clearTimeout(timeout);
        child.kill();
        resolve(stdout.split("\n")[0].trim());
      }
    });

    child.on("exit", (code) => {
      if (!completed) {
        completed = true;
        clearTimeout(timeout);
        if (stdout.trim()) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`agent exited with code ${code} without output`));
        }
      }
    });

    child.stdin.write(fen + "\n");
    child.stdin.end();
  });
}

function buildPgn(
  chess: Chess,
  whiteName: string,
  blackName: string,
  round: number,
  result: string,
  termination: string
): string {
  const headers = [
    `[Event "Chess Agents Ladder"]`,
    `[Round "${round}"]`,
    `[White "${whiteName}"]`,
    `[Black "${blackName}"]`,
    `[Result "${result}"]`,
    `[Termination "${termination}"]`,
  ];
  return headers.join("\n") + "\n\n" + chess.pgn() + " " + result;
}
