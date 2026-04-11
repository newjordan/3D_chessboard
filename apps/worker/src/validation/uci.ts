import { spawn } from "child_process";
import readline from "readline";

export interface UciProbeResult {
  isUci: boolean;
  name?: string;
  author?: string;
  error?: string;
}

/**
 * Probes a binary to check if it's a valid UCI chess engine.
 * Runs inside a Docker container for sandboxing.
 */
export async function probeUci(
  filePath: string,
  timeoutMs: number = 5000
): Promise<UciProbeResult> {
  return new Promise((resolve) => {
    let isUci = false;
    let name = "";
    let author = "";
    let completed = false;

    // Run the probe inside Docker for isolation
    const child = spawn("docker", [
      "run", "--rm", "-i",
      "--network", "none",
      "--security-opt", "no-new-privileges",
      "--memory", "256m",
      "--cpus", "0.5",
      "--mount", `type=bind,source=${filePath},target=/engine,readonly`,
      "chess-engine-runner:latest",
      "/engine",
    ], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    const rl = readline.createInterface({
      input: child.stdout,
      terminal: false,
    });

    const timeout = setTimeout(() => {
      if (!completed) {
        completed = true;
        child.kill("SIGKILL");
        resolve({ isUci: false, error: "UCI handshake timed out." });
      }
    }, timeoutMs);

    child.on("error", (err) => {
      if (!completed) {
        completed = true;
        clearTimeout(timeout);
        resolve({ isUci: false, error: `Failed to spawn process: ${err.message}` });
      }
    });

    rl.on("line", (line) => {
      if (completed) return;

      if (line.startsWith("id name ")) {
        name = line.replace("id name ", "").trim();
      } else if (line.startsWith("id author ")) {
        author = line.replace("id author ", "").trim();
      } else if (line === "uciok") {
        isUci = true;
        completed = true;
        clearTimeout(timeout);
        child.kill();
        resolve({ isUci, name, author });
      }
    });

    child.on("exit", (code) => {
      if (!completed) {
        completed = true;
        clearTimeout(timeout);
        resolve({ isUci: false, error: `Process exited prematurely with code ${code}.` });
      }
    });

    // Start the handshake
    child.stdin.write("uci\n");
  });
}
