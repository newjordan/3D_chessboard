import fs from "fs/promises";

export interface StaticAnalysisResult {
  isValid: boolean;
  error?: string;
}

const FORBIDDEN_PATTERNS = {
  js: [
    "process",
    "require",
    "import",
    "eval",
    "fs",
    "child_process",
    "fetch",
    "XMLHttpRequest",
    "http",
    "https",
  ],
  py: [
    "os",
    "sys",
    "subprocess",
    "requests",
    "urllib",
    "socket",
    "getattr",
    "eval",
    "exec",
    "shutil",
    "importlib",
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
      // Use word boundaries to avoid false positives on legitimate variable names
      // e.g. "chess_process" should be allowed, but "process" should not.
      const regex = new RegExp(`\\b${pattern}\\b`, "g");
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
