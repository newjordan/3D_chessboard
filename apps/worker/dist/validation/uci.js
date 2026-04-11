"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.probeUci = probeUci;
const child_process_1 = require("child_process");
const readline_1 = __importDefault(require("readline"));
/**
 * Probes a binary to check if it's a valid UCI chess engine.
 * Runs inside a Docker container for sandboxing.
 */
async function probeUci(filePath, timeoutMs = 5000) {
    return new Promise((resolve) => {
        let isUci = false;
        let name = "";
        let author = "";
        let completed = false;
        // Run the probe inside Docker for isolation
        const child = (0, child_process_1.spawn)("docker", [
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
        const rl = readline_1.default.createInterface({
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
            if (completed)
                return;
            if (line.startsWith("id name ")) {
                name = line.replace("id name ", "").trim();
            }
            else if (line.startsWith("id author ")) {
                author = line.replace("id author ", "").trim();
            }
            else if (line === "uciok") {
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
