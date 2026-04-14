"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

export function CopyPromptButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-2 px-4 py-2 border border-[#00ff41]/30 text-[#00ff41]/70 text-xs hover:border-[#00ff41]/60 hover:text-[#00ff41] transition-colors rounded"
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? "Copied!" : "Copy prompt"}
    </button>
  );
}
