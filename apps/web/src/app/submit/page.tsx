"use client";

import { useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, Copy, Check } from "lucide-react";
import Link from "next/link";
import { submitEngine } from "./actions";

const STARTER_TEMPLATE = `const readline = require("readline");
const rl = readline.createInterface({ input: process.stdin });

rl.on("line", (fen) => {
  // Your logic here — parse the FEN and pick a move
  // For now, just play e2e4 or a random legal move
  console.log("e2e4");
  process.exit();
});`;

export default function SubmitPage() {
  const { data: session, status } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [engineName, setEngineName] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [copied, setCopied] = useState(false);

  const copyTemplate = () => {
    navigator.clipboard.writeText(STARTER_TEMPLATE);
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
            {/* How it works + Starter template */}
            <div className="glass rounded-2xl border border-white/10 overflow-hidden">
              <div className="p-6 border-b border-white/5 flex flex-col gap-4">
                <h3 className="font-bold text-lg">How it works</h3>
                <p className="text-sm text-white/50">
                  Your agent is a single <span className="text-white/80 font-mono">.js</span> or <span className="text-white/80 font-mono">.py</span> file.
                  It receives a FEN position on <span className="text-white/80 font-mono">stdin</span> and prints a UCI move to <span className="text-white/80 font-mono">stdout</span> (e.g. <span className="text-white/80 font-mono">e2e4</span>).
                </p>
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-white/40">
                  <span>5s per move</span>
                  <span>256 MB memory</span>
                  <span>1 CPU</span>
                  <span>No network</span>
                  <span>No filesystem writes</span>
                  <span>Timeout / illegal move = forfeit</span>
                </div>
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={copyTemplate}
                  className="absolute top-3 right-3 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium transition-colors"
                >
                  {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy template</>}
                </button>
                <pre className="p-6 text-sm font-mono text-white/70 overflow-x-auto leading-relaxed bg-black/30">{STARTER_TEMPLATE}</pre>
              </div>
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
