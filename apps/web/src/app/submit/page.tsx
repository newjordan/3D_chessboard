"use client";

import { useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, Copy, Check } from "lucide-react";
import Link from "next/link";
import { submitEngine } from "./actions";

const AGENT_PROMPT = `Build me a chess agent as a single .js file (Node.js, no dependencies).

Requirements:
- Read a single FEN string from stdin (one line)
- Output a single UCI move to stdout (e.g. "e2e4") and exit
- The move MUST be legal for the given position
- You have 5 seconds per move, 256MB memory, 1 CPU core
- No network access, no filesystem writes
- No external packages — stdlib only

The agent will be called once per move with the current board state as a FEN string. It should analyze the position and print the best move it can find in UCI notation (e.g. "e2e4", "g1f3", "e7e8q" for promotion).`;

export default function SubmitPage() {
  const { data: session, status } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [engineName, setEngineName] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [copied, setCopied] = useState(false);

  const copyPrompt = () => {
    navigator.clipboard.writeText(AGENT_PROMPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      const ext = selectedFile.name.split(".").pop()?.toLowerCase();
      if (ext !== "js" && ext !== "py") {
        setErrorMsg("Only .js and .py files are accepted.");
        setFile(null);
        return;
      }
      if (selectedFile.size > 1024 * 1024) {
        setErrorMsg("File too large. Maximum size is 1MB.");
        setFile(null);
        return;
      }
      setFile(selectedFile);
      setErrorMsg("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !engineName) return;

    setIsUploading(true);
    setUploadStatus("idle");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", engineName);

      const result = await submitEngine(formData);
      
      if (result.success) {
        setUploadStatus("success");
      } else {
        setErrorMsg(result.error || "Upload failed");
        setUploadStatus("error");
      }
    } catch (err: any) {
      setUploadStatus("error");
      setErrorMsg(err.message || "Failed to upload engine. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  if (status === "loading") return null;

  if (!session) {
    return (
      <div className="container mx-auto px-4 pt-20 flex flex-col items-center justify-center min-h-[60vh] text-center gap-6">
        <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center">
          <AlertCircle size={40} className="text-accent" />
        </div>
        <h1 className="text-4xl font-bold">Authentication Required</h1>
        <p className="text-white/60 max-w-md">
          You must be signed in to submit an engine to the ladder. 
          We use GitHub for identity to track engine ownership.
        </p>
        <button
          onClick={() => signIn("github")}
          className="px-8 py-3 rounded-full bg-accent text-background font-bold hover:scale-105 transition-transform"
        >
          Sign In with GitHub
        </button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 max-w-4xl pt-10 pb-20">
      <div className="flex flex-col gap-10">
        <div>
          <h1 className="text-4xl font-extrabold mb-4">Submit Your <span className="gold-gradient">Engine</span></h1>
          <p className="text-white/60">Upload a single .js or .py agent file. Reads FEN from stdin, outputs a move. Max 1MB.</p>
        </div>

        {uploadStatus === "success" ? (
          <div className="glass p-10 rounded-[2rem] border border-accent/20 flex flex-col items-center text-center gap-6 animate-in fade-in zoom-in duration-500">
            <div className="w-20 h-20 rounded-full bg-accent/20 flex items-center justify-center">
              <CheckCircle2 size={48} className="text-accent" />
            </div>
            <div className="flex flex-col gap-2">
              <h2 className="text-2xl font-bold">Submission Received!</h2>
              <p className="text-white/60">
                Your engine <strong>{engineName}</strong> is now in the validation queue.
                We&apos;ll run some smoke tests and notify you shortly.
              </p>
            </div>
            <div className="flex gap-4">
              <Link href="/dashboard" className="px-6 py-2 rounded-full glass hover:bg-white/10 transition-colors text-sm font-bold">
                My Dashboard
              </Link>
              <button
                onClick={() => setUploadStatus("idle")}
                className="px-6 py-2 rounded-full border border-accent/20 text-accent hover:bg-accent/5 transition-colors text-sm font-bold"
              >
                Submit Another
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-8">
            {/* Agent prompt — copy and give to your AI */}
            <div className="glass rounded-2xl border border-white/10 overflow-hidden">
              <div className="p-5 border-b border-white/5 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-lg">Build your agent</h3>
                  <p className="text-sm text-white/40 mt-1">Copy this prompt and give it to your AI coding assistant</p>
                </div>
                <button
                  type="button"
                  onClick={copyPrompt}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent/10 hover:bg-accent/20 border border-accent/20 text-accent text-sm font-bold transition-colors shrink-0"
                >
                  {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy prompt</>}
                </button>
              </div>
              <pre className="p-5 text-sm font-mono text-white/50 overflow-x-auto leading-relaxed bg-black/20 whitespace-pre-wrap">{AGENT_PROMPT}</pre>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold uppercase tracking-widest text-white/40">Engine Name</label>
              <input
                type="text"
                placeholder="e.g. MySuperChess v1.0"
                value={engineName}
                onChange={(e) => setEngineName(e.target.value)}
                required
                maxLength={64}
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 focus:outline-none focus:border-accent/40 transition-colors"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold uppercase tracking-widest text-white/40">Agent File (.js or .py)</label>
              <div className="relative group">
                <input
                  type="file"
                  accept=".js,.py"
                  onChange={handleFileChange}
                  required
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                />
                <div className={`w-full h-48 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-4 transition-all ${file ? 'border-accent bg-accent/5' : 'border-white/10 bg-white/5 group-hover:border-white/20'}`}>
                  {file ? (
                    <>
                      <FileText size={48} className="text-accent" />
                      <div className="text-center">
                        <p className="font-bold">{file.name}</p>
                        <p className="text-xs text-white/40">{(file.size / 1024).toFixed(1)} KB</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <Upload size={48} className="text-white/20 group-hover:text-white/40 transition-colors" />
                      <div className="text-center">
                        <p className="font-bold">Drop your .js or .py file here</p>
                        <p className="text-xs text-white/40">or click to browse</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
              {errorMsg && <p className="text-red-400 text-sm flex items-center gap-1"><AlertCircle size={14} /> {errorMsg}</p>}
            </div>

            <button
              type="submit"
              disabled={isUploading || !file || !engineName}
              className="w-full py-5 rounded-2xl bg-accent text-background font-extrabold text-xl flex items-center justify-center gap-3 hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:scale-100 shadow-[0_0_40px_rgba(212,175,55,0.2)]"
            >
              {isUploading ? (
                <>
                  <Loader2 size={24} className="animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <CheckCircle2 size={24} />
                  Complete Submission
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
