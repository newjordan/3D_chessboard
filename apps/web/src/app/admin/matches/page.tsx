"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { ApiClient } from "@/lib/apiClient";
import { toast } from "sonner";
import { 
  Trophy, 
  Activity, 
  Clock, 
  CheckCircle2, 
  XCircle,
  ExternalLink,
  Cpu,
  Search
} from "lucide-react";

export default function MatchesAdmin() {
  const { data: session } = useSession();
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const fetchMatches = async () => {
    if (session?.user) {
      try {
        const data = await ApiClient.getAdminMatches((session.user as any).id);
        setMatches(data);
      } catch (err) {
        toast.error("Failed to fetch matches");
      } finally {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchMatches();
  }, [session]);

  const filteredMatches = matches.filter(m => 
    m.challengerEngine.name.toLowerCase().includes(filter.toLowerCase()) ||
    m.defenderEngine.name.toLowerCase().includes(filter.toLowerCase()) ||
    m.processedBy?.toLowerCase().includes(filter.toLowerCase())
  );

  if (loading) return <div className="text-white/20 px-8 py-12">Monitoring arena matches...</div>;

  return (
    <div className="space-y-12">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-white mb-2">Match History</h1>
          <p className="text-white/40 font-medium">Real-time audit log of all arena confrontations.</p>
        </div>
        
        <div className="relative group w-full md:w-96">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-white/20 group-hover:text-purple-400 transition-colors" size={20} />
          <input 
            type="text"
            placeholder="Search engines or runners..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full bg-black/40 border border-white/5 rounded-2xl pl-16 pr-8 py-4 text-white focus:border-purple-500/50 outline-none backdrop-blur-xl transition-all"
          />
        </div>
      </header>

      <div className="overflow-hidden rounded-[2rem] bg-black/40 border border-white/5 backdrop-blur-xl shrink-0">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-white/5 uppercase font-mono text-[10px] tracking-widest text-white/30">
              <th className="px-8 py-6">Matchup</th>
              <th className="px-8 py-6">Status</th>
              <th className="px-8 py-6">Result</th>
              <th className="px-8 py-6">Runner</th>
              <th className="px-8 py-6 text-right">Started</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredMatches.map((match) => (
              <tr key={match.id} className="group hover:bg-white/[0.02] transition-colors">
                <td className="px-8 py-6">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                       <span className="font-bold text-white group-hover:text-purple-400 transition-colors">
                        {match.challengerEngine.name}
                      </span>
                      <span className="text-white/20 text-[10px] font-mono">v.</span>
                      <span className="font-bold text-white group-hover:text-purple-400 transition-colors">
                        {match.defenderEngine.name}
                      </span>
                    </div>
                    <div className="text-[10px] text-white/20 flex items-center gap-2 uppercase tracking-tighter">
                      <Cpu size={12} /> {match.challengerVersion.versionLabel} vs {match.defenderVersion.versionLabel}
                    </div>
                  </div>
                </td>
                <td className="px-8 py-6">
                  <div className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest ${
                    match.status === 'completed' ? 'text-green-400' : 
                    match.status === 'running' ? 'text-blue-400' : 'text-white/30'
                  }`}>
                    {match.status === 'completed' ? <CheckCircle2 size={14} /> : 
                     match.status === 'running' ? <Activity size={14} className="animate-pulse" /> : <Clock size={14} />}
                    {match.status}
                  </div>
                </td>
                <td className="px-8 py-6">
                  {match.status === 'completed' ? (
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-white/80">
                        {parseFloat(match.challengerScore).toFixed(1)} - {parseFloat(match.defenderScore).toFixed(1)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-white/10 text-xs">-</span>
                  )}
                </td>
                <td className="px-8 py-6">
                  {match.processedBy ? (
                    <div className="px-3 py-1 rounded-lg bg-green-500/5 border border-green-500/10 text-[10px] text-green-400 font-mono inline-block">
                      {match.processedBy}
                    </div>
                  ) : (
                    <span className="text-white/10 text-xs">Awaiting...</span>
                  )}
                </td>
                <td className="px-8 py-6 text-right">
                  <div className="text-xs text-white/40 font-mono">
                    {match.startedAt ? new Date(match.startedAt).toLocaleString([], { hour: '2-digit', minute: '2-digit' }) : 
                     new Date(match.createdAt).toLocaleDateString()}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {filteredMatches.length === 0 && (
          <div className="py-20 text-center space-y-4 opacity-50">
            <Trophy className="w-12 h-12 text-white/10 mx-auto" />
            <p className="text-sm text-white/30 px-12">No matches found matching your current filter.</p>
          </div>
        )}
      </div>
    </div>
  );
}
