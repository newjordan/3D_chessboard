const ALLOWED_LANGUAGES = new Set(["js", "py"]);

export function validateFileType(storageKey: string): {
  isValid: boolean;
  language?: "js" | "py";
  error?: string;
} {
  if (storageKey.endsWith(".js")) return { isValid: true, language: "js" };
  if (storageKey.endsWith(".py")) return { isValid: true, language: "py" };
  return { isValid: false, error: "Unsupported file type. Only .js and .py agents are accepted." };
}
