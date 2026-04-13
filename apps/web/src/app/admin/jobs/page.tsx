"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { ApiClient } from "@/lib/apiClient";
import { toast } from "sonner";
import { 
  RefreshCcw,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle
} from "lucide-react";

export default function JobsAdmin() {
  const { data: session } = useSession();
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchJobs = async () => {
    if (session?.user) {
      const data = await ApiClient.getAdminJobs((session.user as any).id);
      setJobs(data);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 10000); // Poll every 10s
    return () => clearInterval(interval);
  }, [session]);

  const handleRetry = async (jobId: string) => {
    try {
      await ApiClient.retryJob(jobId, (session?.user as any).id);
      toast.success("Job re-queued successfully");
      fetchJobs();
    } catch (err: any) {
      toast.error(err.message || "Retry failed");
    }
  };

  if (loading) return <div className="text-white/20 px-8 py-12">Synchronizing queue state...</div>;

  return (
    <div className="space-y-12">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-white mb-2">Job Queue</h1>
          <p className="text-white/40 font-medium">Monitor and manage automated background procedures.</p>
        </div>
        <button 
          onClick={fetchJobs}
          className="p-4 rounded-2xl bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all border border-white/5"
        >
          <RefreshCcw className="w-6 h-6" />
        </button>
      </header>

      <div className="space-y-2">
        {jobs.map((job) => (
          <div key={job.id} className="p-5 rounded-2xl bg-black/40 border border-white/5 flex items-center justify-between group hover:border-white/10 transition-all">
            <div className="flex items-center gap-6 flex-1">
              <JobStatusIcon status={job.status} />
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-black uppercase tracking-widest text-purple-400 font-mono">{job.jobType.replace(/_/g, '.')}</span>
                  <span className="text-[10px] text-white/20 font-mono">{job.id.substring(0, 8)}</span>
                </div>
                <p className="text-sm font-medium text-white/60 mt-1 max-w-lg truncate">
                  {JSON.stringify(job.payloadJson)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="text-right">
                <p className="text-[10px] font-mono text-white/20">Attempts: {job.attempts}</p>
                <p className="text-[10px] font-mono text-white/20 uppercase">
                  {new Date(job.createdAt).toLocaleTimeString()}
                </p>
              </div>

              {job.status === 'failed' && (
                <button 
                  onClick={() => handleRetry(job.id)}
                  className="bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 px-4 py-2 rounded-xl text-xs font-bold border border-purple-500/20 transition-all"
                >
                  RETRY
                </button>
              )}
            </div>
          </div>
        ))}

        {jobs.length === 0 && (
          <div className="py-24 text-center">
            <Clock className="w-12 h-12 text-white/5 mx-auto mb-4" />
            <p className="text-white/20 font-medium italic">No recent jobs found in the queue.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function JobStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed': return <CheckCircle className="w-6 h-6 text-green-500/40" />;
    case 'failed': return <AlertCircle className="w-6 h-6 text-red-500" />;
    case 'processing': return <RefreshCcw className="w-6 h-6 text-blue-500 animate-spin" />;
    default: return <Clock className="w-6 h-6 text-white/10" />;
  }
}
