import fs from "fs/promises";
import vm from "vm";

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
    "require('http')",
    'require("http")',
    "require('https')",
    'require("https")',
    'import.*http',
    "fetch\\(",
    "XMLHttpRequest",
    "eval\\(",
    "new Function",
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
    "import requests",
    "import urllib",
    "import socket",
    "eval\\(",
    "exec\\(",
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
    const trimmed = content.trim();

    // 1. Structural Check: Detect HTML/XML signatures
    if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html") || (trimmed.startsWith("<") && trimmed.includes("</"))) {
        return {
            isValid: false,
            error: "This appears to be an HTML or XML file. Please submit the raw engine code (pure JavaScript or Python), not a webpage or document."
        };
    }

    // 2. Syntax Check: Verify language-specific syntax
    if (language === "js") {
        try {
            new vm.Script(content);
        } catch (err: any) {
            return {
                isValid: false,
                error: `Syntax error in JavaScript code: ${err.message}. Ensure you are not submitting an HTML file or malformed code.`
            };
        }
    }

    let searchContent = content;
    
    // Strip comments to avoid false positives in licenses/headers
    if (language === "js") {
      // Remove /* */ and // comments
      searchContent = searchContent.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
    } else if (language === "py") {
      // Remove # comments and triple-quoted docstrings
      searchContent = searchContent.replace(/(?:"{3}|'{3})[\s\S]*?(?:"{3}|'{3})|#.*/g, "");
    }

    const patterns = FORBIDDEN_PATTERNS[language] || [];

    for (const pattern of patterns) {
      // Escape special regex characters in the pattern (e.g. dots)
      const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`\\b${escapedPattern}\\b`, "g");
      if (regex.test(searchContent)) {
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
