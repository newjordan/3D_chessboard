import { spawn } from "child_process";
import { Chess } from "chess.js";

export interface ProbeResult {
  isValid: boolean;
  error?: string;
}

const TEST_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const MOVE_REGEX = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

/**
 * Probes an agent by sending a FEN position and checking if it returns a legal move.
 * Runs inside Docker for sandboxing.
 */
export async function probeAgent(
  filePath: string,
  language: "js" | "py",
  timeoutMs: number = 10000
): Promise<ProbeResult> {
  return new Promise((resolve) => {
    let completed = false;

    const runtime = language === "js" ? "node" : "python3";

    const child = spawn("docker", [
      "run", "--rm", "-i",
      "--network", "none",
      "--security-opt", "no-new-privileges",
      "--memory", "256m",
      "--cpus", "0.5",
      "--pids-limit", "64",
      "--read-only",
      "--mount", `type=bind,source=${filePath},target=/agent/agent.${language},readonly`,
      "chess-agent-runner:latest",
      runtime, `/agent/agent.${language}`,
    ], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    const timeout = setTimeout(() => {
      if (!completed) {
        completed = true;
        child.kill("SIGKILL");
        resolve({ isValid: false, error: "Agent timed out — did not respond within 10 seconds." });
      }
    }, timeoutMs);

    child.on("error", (err) => {
      if (!completed) {
        completed = true;
        clearTimeout(timeout);
        resolve({ isValid: false, error: `Failed to start agent: ${err.message}` });
      }
    });

    let stdout = "";
    child.stdout.on("data", (data) => {
      stdout += data.toString();

      // Check if we have a complete line
      if (!completed && stdout.includes("\n")) {
        completed = true;
        clearTimeout(timeout);
        child.kill();

        const move = stdout.split("\n")[0].trim();

        if (!MOVE_REGEX.test(move)) {
          resolve({ isValid: false, error: `Agent returned invalid move format: "${move}". Expected UCI notation (e.g., e2e4).` });
          return;
        }

        // Validate it's a legal move for the position
        const chess = new Chess(TEST_FEN);
        const result = chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] as any });
        if (!result) {
          resolve({ isValid: false, error: `Agent returned illegal move: "${move}" for starting position.` });
          return;
        }

        resolve({ isValid: true });
      }
    });

    child.on("exit", (code) => {
      if (!completed) {
        completed = true;
        clearTimeout(timeout);
        if (stdout.trim()) {
          // Process exited but we got output — try to validate
          const move = stdout.trim();
          if (!MOVE_REGEX.test(move)) {
            resolve({ isValid: false, error: `Agent returned invalid move format: "${move}".` });
            return;
          }
          const chess = new Chess(TEST_FEN);
          const result = chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] as any });
          if (!result) {
            resolve({ isValid: false, error: `Agent returned illegal move: "${move}".` });
            return;
          }
          resolve({ isValid: true });
        } else {
          resolve({ isValid: false, error: `Agent exited with code ${code} without producing a move.` });
        }
      }
    });

    // Send the test FEN
    child.stdin.write(TEST_FEN + "\n");
    child.stdin.end();
  });
}
