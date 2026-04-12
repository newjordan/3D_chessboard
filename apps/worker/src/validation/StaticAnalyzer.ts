import fs from "fs/promises";

export interface StaticAnalysisResult {
  isValid: boolean;
  error?: string;
}

const FORBIDDEN_PATTERNS = {
  js: [
    "process.env",
    "process.cwd",
    "process.chdir",
    "process.kill",
    // module imports are allowed, but these specific modules are blocked:
    "child_process",
    "http",
    "https",
    "fetch",
    "XMLHttpRequest",
    "eval",
    "Function",
  ],
  py: [
    "os.environ",
    "os.system",
    "os.exec",
    "os.spawn",
    "os.popen",
    "os.kill",
    "sys.modules",
    "subprocess",
    "requests",
    "urllib",
    "socket",
    "eval",
    "exec",
    "shutil",
    "importlib",
    "getattr",
    "setattr",
  ],
};

/**
 * Scans code for forbidden modules and keywords.
 * This is a basic security layer to prevent agents from escaping the sandbox.
 */
export async function analyzeStatic(
  filePath: string,
  language: "js" | "py"
): Promise<StaticAnalysisResult> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const patterns = FORBIDDEN_PATTERNS[language] || [];

    for (const pattern of patterns) {
      // Escape special regex characters in the pattern (e.g. dots)
      const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`\\b${escapedPattern}\\b`, "g");
      if (regex.test(content)) {
        return {
          isValid: false,
          error: `Forbidden pattern detected: "${pattern}". Use of system modules or network calls is strictly prohibited.`,
        };
      }
    }

    return { isValid: true };
  } catch (error: any) {
    return {
      isValid: false,
      error: `Failed to analyze code: ${error.message}`,
    };
  }
}
