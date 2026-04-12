import { analyzeStatic } from "./validation/StaticAnalyzer";
import { probeAgent } from "./validation/probe";
import path from "path";

async function test() {
  const agentPath = path.resolve(__dirname, "../../../seed/agents/surfing-llamas.js");
  console.log(`Testing agent: ${agentPath}`);

  console.log("\n1. Running Static Analysis...");
  const staticResult = await analyzeStatic(agentPath, "js");
  console.log("Result:", staticResult);

  if (!staticResult.isValid) {
    console.error("Static analysis failed!");
    process.exit(1);
  }

  console.log("\n2. Running Agent Probe...");
  const probeResult = await probeAgent(agentPath, "js");
  console.log("Result:", probeResult);

  if (!probeResult.isValid) {
    console.error("Probe failed!");
    process.exit(1);
  }

  console.log("\nSUCCESS: Both checks passed!");
}

test().catch(console.error);
