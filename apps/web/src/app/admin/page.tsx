"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { ApiClient } from "@/lib/apiClient";
import { 
  Users, 
  Cpu, 
  Trophy, 
  Terminal,
  Bell
} from "lucide-react";

export default function AdminDashboard() {
  const { data: session } = useSession();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (session?.user) {
      ApiClient.getAdminStats((session.user as any).id)
        .then(setStats)
        .finally(() => setLoading(false));
    }
  }, [session]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-pulse">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-32 bg-white/5 rounded-3xl border border-white/5"></div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-12">
      <header>
        <h1 className="text-4xl font-black tracking-tight text-white mb-2">Systems Overview</h1>
        <p className="text-white/40 font-medium">Real-time telemetry and management controls.</p>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard 
          label="Total Users" 
          value={stats?.users || 0} 
          icon={<Users className="w-6 h-6" />} 
          color="bg-blue-500" 
        />
        <StatsCard 
          label="Engines" 
          value={stats?.engines || 0} 
          icon={<Cpu className="w-6 h-6" />} 
          color="bg-purple-500" 
        />
        <StatsCard 
          label="Matches Run" 
          value={stats?.matches || 0} 
          icon={<Trophy className="w-6 h-6" />} 
          color="bg-green-500" 
        />
        <StatsCard 
          label="Active Jobs" 
          value={stats?.activeJobs || 0} 
          icon={<Terminal className="w-6 h-6" />} 
          color="bg-amber-500" 
        />
      </div>

      {/* Main Content Areas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="p-8 rounded-[2rem] bg-black/40 border border-white/5 backdrop-blur-xl hover:border-purple-500/30 transition-all group">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-bold">Recent Alerts</h3>
            <Bell className="w-6 h-6 text-white/20 group-hover:text-purple-400 transition-colors" />
          </div>
          <div className="space-y-4">
            {stats?.pendingSubmissions > 0 ? (
              <div className="flex items-center gap-4 p-4 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-200">
                <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></div>
                <p className="text-sm font-medium">{stats.pendingSubmissions} new submissions awaiting validation.</p>
              </div>
            ) : (
              <p className="text-white/20 text-sm italic py-4">No active system alerts.</p>
            )}
          </div>
        </div>

        <div className="p-8 rounded-[2rem] bg-black/40 border border-white/5 backdrop-blur-xl flex flex-col items-center justify-center text-center space-y-4 opacity-50 grayscale hover:opacity-100 hover:grayscale-0 transition-all">
          <Terminal className="w-12 h-12 text-white/10" />
          <p className="text-sm font-medium text-white/40 px-12">Performance analytics and charts will appear here as the season progresses.</p>
        </div>
      </div>
    </div>
  );
}

function StatsCard({ label, value, icon, color }: any) {
  return (
    <div className="p-6 rounded-[2rem] bg-black/40 border border-white/5 backdrop-blur-xl relative overflow-hidden group hover:border-white/20 transition-all">
      <div className={`absolute top-0 right-0 w-24 h-24 ${color} opacity-[0.03] -mr-8 -mt-8 rounded-full blur-3xl group-hover:opacity-10 transition-opacity whitespace-pre-wrap`}></div>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/30 font-bold mb-1">{label}</p>
          <p className="text-4xl font-black text-white">{value}</p>
        </div>
        <div className="p-3 rounded-2xl bg-white/5 text-white/50 group-hover:text-white transition-colors">
          {icon}
        </div>
      </div>
    </div>
  );
}
