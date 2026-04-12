"use client";

import { useState, useEffect } from "react";
import { useSession, signIn } from "next-auth/react";
import { FileText, CheckCircle2, AlertCircle, Loader2, Copy, Check, ChevronLeft, Upload } from "lucide-react";
import Link from "next/link";
import { submitEngine } from "./actions";
import { ApiClient } from "@/lib/apiClient";

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
  const [engineCount, setEngineCount] = useState<number | null>(null);

  useEffect(() => {
    if (session?.user) {
      const userId = (session.user as any).id;
      ApiClient.getEnginesByOwner(userId)
        .then((engines: any[]) => setEngineCount(engines.length))
        .catch(() => setEngineCount(0));
    }
  }, [session]);

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
      <div className="container mx-auto px-6 py-20 max-w-2xl flex flex-col items-center justify-center min-h-[50vh] text-center gap-8">
        <div className="w-12 h-12 rounded-full border border-border-custom flex items-center justify-center">
          <AlertCircle size={20} className="text-muted" />
        </div>
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-bold tracking-tight">Identity Required.</h1>
          <p className="text-muted text-sm leading-relaxed">
            Competition entries are tied to GitHub accounts to prevent floods and ensure verifiable ownership of the prize pool slots.
          </p>
        </div>
        <button
          onClick={() => signIn("github")}
          className="px-8 py-3 bg-foreground text-background font-bold text-sm tracking-tight hover:opacity-90 transition-all"
        >
          Authenticate with GitHub
        </button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 py-16 max-w-4xl flex flex-col gap-16">
      <div className="flex flex-col gap-6">
        <div className="technical-label">V.03 / Registration</div>
        <h1 className="text-5xl font-bold tracking-tight">Submit Agent</h1>
        <p className="text-muted max-w-xl leading-relaxed">
          Upload a stateless agent. It should analyze a single board position and return its best move in under 5 seconds.
        </p>
      </div>

      {uploadStatus === "success" ? (
        <div className="border border-border-custom p-16 flex flex-col items-center text-center gap-8 soft-shadow bg-white/[0.01]">
          <div className="w-12 h-12 rounded-full border border-accent flex items-center justify-center">
            <CheckCircle2 size={24} className="text-accent" />
          </div>
          <div className="flex flex-col gap-3">
            <h2 className="text-3xl font-bold tracking-tight">Handshake Received.</h2>
            <p className="text-muted text-sm max-w-md">
              Agent <strong>{engineName}</strong> has been queued for validation. This normally takes 5-10 seconds of processing time.
            </p>
          </div>
          <div className="flex gap-4">
            <Link href="/dashboard" className="px-6 py-3 border border-border-custom font-bold text-xs uppercase tracking-tight hover:bg-black/[0.02] transition-all">
              Track Progress
            </Link>
            <button
              onClick={() => {
                setUploadStatus("idle");
                setFile(null);
                setEngineName("");
              }}
              className="px-8 py-3 bg-foreground text-background font-bold text-sm tracking-tight hover:opacity-90 transition-all"
            >
              Submit Another
            </button>
          </div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[1fr_300px] gap-20">
          <form onSubmit={handleSubmit} className="flex flex-col gap-12">
            <div className="flex flex-col gap-10">
              <div className="flex flex-col gap-4">
                <label className="technical-label">Engine Designation</label>
                <input
                  type="text"
                  placeholder="e.g. Pawnstorm Alpha"
                  value={engineName}
                  onChange={(e) => setEngineName(e.target.value)}
                  required
                  maxLength={64}
                  className="w-full bg-background border border-border-custom p-4 text-sm font-medium focus:outline-none focus:border-accent transition-colors"
                />
              </div>

              <div className="flex flex-col gap-4">
                <label className="technical-label">Binary (.js or .py)</label>
                <div className="relative group">
                  <input
                    type="file"
                    accept=".js,.py"
                    onChange={handleFileChange}
                    required
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                  />
                  <div className={`w-full min-h-[160px] border border-dashed flex flex-col items-center justify-center gap-4 transition-all ${file ? 'border-accent bg-accent/5' : 'border-border-custom bg-white/[0.01] hover:bg-white/[0.03]'}`}>
                    {file ? (
                      <>
                        <FileText size={32} className="text-accent" />
                        <div className="text-center">
                          <p className="font-bold text-sm">{file.name}</p>
                          <p className="technical-label text-[9px]">{(file.size / 1024).toFixed(1)} KB</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <Upload size={32} className="opacity-10" />
                        <div className="text-center space-y-1">
                          <p className="font-bold text-sm">Drop agent code here</p>
                          <p className="technical-label text-[9px]">JS or Python / Max 1MB</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                {errorMsg && <p className="mt-3 text-red-800 text-xs flex items-center gap-1 font-medium"><AlertCircle size={12} /> {errorMsg}</p>}
              </div>
            </div>

            <button
              type="submit"
              disabled={isUploading || !file || !engineName || (engineCount !== null && engineCount >= 3)}
              className="w-full py-4 bg-foreground text-background font-bold text-sm tracking-tight border-2 border-transparent hover:opacity-90 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:border-neutral-700 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-3 soft-shadow"
            >
              {isUploading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Processing...
                </>
              ) : (engineCount !== null && engineCount >= 3) ? (
                <>
                  <AlertCircle size={16} />
                  Registration Capped (3/3)
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  Complete Submission
                </>
              )}
            </button>
          </form>

          {/* Prompt Helper Section */}
          <div className="flex flex-col gap-10">
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between border-b border-border-custom pb-4">
                <span className="technical-label">Technical Spec</span>
                <button
                  type="button"
                  onClick={copyPrompt}
                  className="technical-label flex items-center gap-1 hover:text-accent transition-colors"
                >
                  {copied ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy</>}
                </button>
              </div>
              <div className="bg-white/[0.02] border border-border-custom p-6">
                <pre className="text-[11px] font-mono text-muted whitespace-pre-wrap leading-relaxed">
                  {AGENT_PROMPT.substring(0, 300)}...
                </pre>
              </div>
              <p className="text-[11px] leading-relaxed text-muted font-medium">
                Standard tournament rules apply. Any attempt to access the filesystem or network will result in immediate rejection by the sandbox.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
