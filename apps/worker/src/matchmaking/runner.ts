import { spawn, ChildProcess } from "child_process";
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
const MOVE_TIMEOUT_MS = 10000; // Increased to 10s for stability during tests

/**
 * Manages the lifecycle of an engine process during a game.
 * Uses a "One-Shot" model (Fresh spawn + Stdin end) for maximum compatibility.
 */
class EngineController {
  private child: ChildProcess | null = null;
  private config: AgentConfig;
  private isDead = false;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  private spawn() {
    const runtime = this.config.language === "js" ? "node" : "python3";
    this.child = spawn(runtime, [this.config.path], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { PATH: process.env.PATH },
    });

    this.child.on("exit", () => {
      this.isDead = true;
      this.child = null;
    });

    this.child.stderr?.on("data", (data) => {
      console.error(`[${this.config.name} STDERR]: ${data}`);
    });
  }

  async getMove(fen: string): Promise<string> {
    const startBoot = performance.now();
    this.isDead = false;
    this.spawn();
    const endBoot = performance.now();
    console.log(`[${this.config.name}] Boot time: ${(endBoot - startBoot).toFixed(2)}ms`);

    const child = this.child!;
    const startThink = performance.now();

    return new Promise((resolve, reject) => {
      let completed = false;
      let stdout = "";

      const onData = (data: Buffer) => {
        stdout += data.toString();
        if (!completed && stdout.includes("\n")) {
          completed = true;
          cleanup();
          const endThink = performance.now();
          console.log(`[${this.config.name}] Think time: ${(endThink - startThink).toFixed(2)}ms`);
          resolve(stdout.split("\n")[0].trim());
        }
      };

      const onExit = (code: number | null) => {
        if (!completed) {
          completed = true;
          cleanup();
          if (stdout.trim()) {
            resolve(stdout.trim());
          } else {
            reject(new Error(`engine exited with code ${code} without output`));
          }
        }
      };

      const onError = (err: Error) => {
        if (!completed) {
          completed = true;
          cleanup();
          reject(new Error(`engine error: ${err.message}`));
        }
      };

      const timeout = setTimeout(() => {
        if (!completed) {
          completed = true;
          cleanup();
          child.kill("SIGKILL");
          reject(new Error("move timeout"));
        }
      }, MOVE_TIMEOUT_MS);

      const cleanup = () => {
        clearTimeout(timeout);
        child.stdout?.removeListener("data", onData);
        child.removeListener("exit", onExit);
        child.removeListener("error", onError);
      };

      child.stdout?.on("data", onData);
      child.on("exit", onExit);
      child.on("error", onError);

      child.stdin?.write(fen + "\n");
      child.stdin?.end();
    });
  }

  stop() {
    if (this.child && !this.isDead) {
      this.child.kill();
    }
  }
}

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

  const whiteController = new EngineController(white);
  const blackController = new EngineController(black);

  try {
    while (!chess.isGameOver() && chess.moveNumber() <= MAX_PLIES) {
      const currentController = chess.turn() === "w" ? whiteController : blackController;
      const fen = chess.fen();

      let move: string;
      try {
        move = await currentController.getMove(fen);
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
  } finally {
    whiteController.stop();
    blackController.stop();
  }
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
