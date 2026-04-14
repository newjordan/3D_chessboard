"use client";

import { CheckCircle, XCircle, Clock, Zap, Copy } from "lucide-react";
import { useState } from "react";

export function RunnerDashboard({ initialKey }: { initialKey: any }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!initialKey) {
    return (
      <div className="border border-[#00ff41]/10 rounded p-8 text-center space-y-3">
        <XCircle size={28} className="mx-auto text-[#00ff41]/20" />
        <p className="text-[#00ff41]/50 text-sm">No runner key found for your account.</p>
        <p className="text-[#00ff41]/30 text-xs">Contact an admin to get registered as a runner.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="border border-[#00ff41]/10 rounded p-5 space-y-1">
          <div className="text-xs text-[#00ff41]/40 uppercase tracking-widest">Status</div>
          <div className="flex items-center gap-2 text-sm font-bold">
            {initialKey.revokedAt ? (
              <span className="text-red-400 flex items-center gap-1"><XCircle size={14} /> Revoked</span>
            ) : initialKey.trusted ? (
              <span className="text-[#00ff41] flex items-center gap-1"><CheckCircle size={14} /> Trusted</span>
            ) : (
              <span className="text-amber-400 flex items-center gap-1"><Clock size={14} /> Pending Approval</span>
            )}
          </div>
        </div>
        <div className="border border-[#00ff41]/10 rounded p-5 space-y-1">
          <div className="text-xs text-[#00ff41]/40 uppercase tracking-widest">Jobs Processed</div>
          <div className="flex items-center gap-2 text-2xl font-bold text-[#00ff41]">
            <Zap size={18} className="text-[#00ff41]/50" />
            {initialKey.jobsProcessed}
          </div>
        </div>
        <div className="border border-[#00ff41]/10 rounded p-5 space-y-1">
          <div className="text-xs text-[#00ff41]/40 uppercase tracking-widest">Key Issued</div>
          <div className="text-sm text-[#00ff41]/70">
            {new Date(initialKey.createdAt).toLocaleDateString()}
          </div>
        </div>
      </div>

      <div className="border border-[#00ff41]/10 rounded p-5 space-y-2">
        <div className="text-xs text-[#00ff41]/40 uppercase tracking-widest mb-3">Public Key</div>
        <div className="flex items-start gap-3">
          <pre className="flex-1 text-xs text-[#00ff41]/60 font-mono whitespace-pre-wrap break-all bg-black/40 rounded p-3">
            {initialKey.publicKey}
          </pre>
          <button
            onClick={() => handleCopy(initialKey.publicKey)}
            className="p-2 border border-[#00ff41]/10 rounded hover:border-[#00ff41]/30 text-[#00ff41]/40 hover:text-[#00ff41] transition-colors shrink-0"
          >
            {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
          </button>
        </div>
      </div>

      {!initialKey.trusted && !initialKey.revokedAt && (
        <div className="border border-amber-400/20 bg-amber-400/5 rounded p-4 text-amber-400/80 text-xs">
          Your runner key is pending admin approval. Once trusted, you can start fetching jobs using the commands above.
        </div>
      )}
    </div>
  );
}
