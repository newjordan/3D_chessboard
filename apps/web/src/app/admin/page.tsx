"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import { ApiClient } from '@/lib/apiClient';
import Link from 'next/link';
import { 
  Shield, Users, Cpu, Swords, Zap, Activity, AlertTriangle,
  Clock, ChevronRight, Trash2, RefreshCw, Ban, CheckCircle,
  BarChart3, TrendingUp, Eye, Wrench
} from 'lucide-react';

const ADMIN_ID = "45865838";

type Tab = 'overview' | 'users' | 'engines' | 'jobs';

export default function AdminPage() {
  const { data: session, status } = useSession();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [engines, setEngines] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const userId = (session?.user as any)?.id;
  const isAdmin = userId === ADMIN_ID;

  const fetchData = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const [statsData, usersData, enginesData, jobsData] = await Promise.all([
        ApiClient.getAdminStats().catch(() => null),
        ApiClient.getAdminUsers().catch(() => []),
        ApiClient.getAdminEngines().catch(() => []),
        ApiClient.getAdminJobs().catch(() => []),
      ]);
      setStats(statsData);
      setUsers(usersData || []);
      setEngines(enginesData || []);
      setJobs(jobsData || []);
    } catch (e) {
      console.error("Admin fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (status === 'authenticated' && isAdmin) fetchData();
  }, [status, isAdmin, fetchData]);

  // Auth gate
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="technical-label animate-pulse opacity-20">Authenticating...</div>
      </div>
    );
  }

  if (!session || !isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6">
        <Shield size={48} className="text-red-500 opacity-40" />
        <h1 className="text-3xl font-bold">Access Denied</h1>
        <p className="text-muted text-sm">This area requires administrative clearance.</p>
        <Link href="/" className="text-accent technical-label hover:underline">Return to Terminal</Link>
      </div>
    );
  }

  const handleEngineStatus = async (engineId: string, newStatus: string) => {
    setActionLoading(engineId);
    try {
      await ApiClient.updateEngineStatus(engineId, newStatus);
      await fetchData();
    } catch (e) {
      console.error("Status update failed:", e);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteEngine = async (engineId: string, name: string) => {
    if (!confirm(`Permanently delete "${name}"? This cannot be undone.`)) return;
    setActionLoading(engineId);
    try {
      await ApiClient.adminDeleteEngine(engineId);
      await fetchData();
    } catch (e) {
      console.error("Delete failed:", e);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRetryJob = async (jobId: string) => {
    setActionLoading(jobId);
    try {
      await ApiClient.retryJob(jobId);
      await fetchData();
    } catch (e) {
      console.error("Retry failed:", e);
    } finally {
      setActionLoading(null);
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <BarChart3 size={14} /> },
    { id: 'users', label: 'Users', icon: <Users size={14} /> },
    { id: 'engines', label: 'Engines', icon: <Cpu size={14} /> },
    { id: 'jobs', label: 'Jobs', icon: <Wrench size={14} /> },
  ];

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <div className="border-b border-border-custom bg-white/[0.01]">
        <div className="container mx-auto px-4 sm:px-6 py-8 sm:py-12 max-w-7xl">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Shield size={16} className="text-red-500" />
                <span className="technical-label text-red-500/80 text-[10px] uppercase tracking-widest font-bold">Admin Console</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Platform Control</h1>
              <p className="text-muted text-sm">Real-time analytics and management for Chess Agents infrastructure.</p>
            </div>
            <button
              onClick={fetchData}
              disabled={loading}
              className="px-4 py-2 bg-white/5 border border-white/10 text-sm font-medium hover:bg-white/10 transition-colors flex items-center gap-2 rounded-lg self-start sm:self-auto"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 mt-8 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 text-sm font-medium flex items-center gap-2 rounded-lg transition-all whitespace-nowrap ${
                  activeTab === tab.id 
                    ? 'bg-white/10 text-white' 
                    : 'text-white/40 hover:text-white/70 hover:bg-white/5'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 sm:px-6 py-8 max-w-7xl">
        {loading ? (
          <div className="py-32 flex items-center justify-center">
            <div className="technical-label animate-pulse opacity-20">Loading platform data...</div>
          </div>
        ) : (
          <>
            {activeTab === 'overview' && <OverviewTab stats={stats} />}
            {activeTab === 'users' && <UsersTab users={users} />}
            {activeTab === 'engines' && (
              <EnginesTab 
                engines={engines} 
                onStatusChange={handleEngineStatus} 
                onDelete={handleDeleteEngine} 
                actionLoading={actionLoading} 
              />
            )}
            {activeTab === 'jobs' && (
              <JobsTab 
                jobs={jobs} 
                onRetry={handleRetryJob} 
                actionLoading={actionLoading} 
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// TAB: Overview
// ============================================================
function OverviewTab({ stats }: { stats: any }) {
  if (!stats) return <div className="text-muted text-sm">No stats available.</div>;

  const { overview } = stats;
  const kpis = [
    { label: 'Total Users', value: overview.totalUsers, icon: <Users size={16} />, color: 'text-blue-400' },
    { label: 'Total Engines', value: overview.totalEngines, icon: <Cpu size={16} />, color: 'text-purple-400' },
    { label: 'Active Engines', value: overview.activeEngines, icon: <CheckCircle size={16} />, color: 'text-accent' },
    { label: 'Total Matches', value: overview.totalMatches, icon: <Swords size={16} />, color: 'text-orange-400' },
    { label: 'Total Games', value: overview.totalGames, icon: <Activity size={16} />, color: 'text-pink-400' },
    { label: 'Running Matches', value: overview.runningMatches, icon: <Zap size={16} />, color: 'text-yellow-400' },
    { label: 'Pending Jobs', value: overview.pendingJobs, icon: <Clock size={16} />, color: 'text-cyan-400' },
    { label: 'Failed Jobs', value: overview.failedJobs, icon: <AlertTriangle size={16} />, color: overview.failedJobs > 0 ? 'text-red-500' : 'text-white/30' },
  ];

  return (
    <div className="flex flex-col gap-10">
      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => (
          <div key={i} className="bg-white/[0.02] border border-border-custom rounded-xl p-5 flex flex-col gap-3">
            <div className={`${kpi.color} opacity-60`}>{kpi.icon}</div>
            <div>
              <div className="text-2xl sm:text-3xl font-bold font-mono tracking-tighter">{kpi.value}</div>
              <div className="text-[10px] technical-label opacity-40 uppercase mt-1">{kpi.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Engine Status Distribution */}
        <div className="bg-white/[0.02] border border-border-custom rounded-xl p-6 flex flex-col gap-4">
          <h3 className="technical-label text-xs opacity-60 uppercase tracking-widest">Engine Status Distribution</h3>
          <div className="flex flex-col gap-3">
            {(stats.enginesByStatus || []).map((s: any) => (
              <div key={s.status} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${
                    s.status === 'active' ? 'bg-accent' : 
                    s.status === 'banned' ? 'bg-red-500' : 
                    s.status === 'pending' ? 'bg-yellow-500' : 'bg-white/20'
                  }`} />
                  <span className="text-sm font-medium capitalize">{s.status}</span>
                </div>
                <span className="font-mono text-sm font-bold">{s.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Rated */}
        <div className="bg-white/[0.02] border border-border-custom rounded-xl p-6 flex flex-col gap-4">
          <h3 className="technical-label text-xs opacity-60 uppercase tracking-widest">Top Rated Engines</h3>
          <div className="flex flex-col gap-3">
            {(stats.topEngines || []).map((e: any, i: number) => (
              <div key={e.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`font-mono text-xs w-6 ${i < 3 ? 'text-accent font-bold' : 'opacity-30'}`}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <Link href={`/engines/${e.slug}`} className="text-sm font-medium hover:text-accent transition-colors">
                    {e.name}
                  </Link>
                  <span className="text-[10px] technical-label opacity-30">@{e.owner.username}</span>
                </div>
                <span className="font-mono text-sm font-bold">{e.currentRating}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Match Activity (7-Day) */}
        <div className="bg-white/[0.02] border border-border-custom rounded-xl p-6 flex flex-col gap-4">
          <h3 className="technical-label text-xs opacity-60 uppercase tracking-widest">Match Activity (7 Days)</h3>
          {stats.matchesByDay && stats.matchesByDay.length > 0 ? (
            <div className="flex items-end gap-2 h-32">
              {stats.matchesByDay.map((d: any, i: number) => {
                const max = Math.max(...stats.matchesByDay.map((x: any) => x.count));
                const height = max > 0 ? (d.count / max) * 100 : 0;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                    <span className="text-[9px] font-mono opacity-0 group-hover:opacity-60 transition-opacity">{d.count}</span>
                    <div 
                      className="w-full bg-accent/60 rounded-t-sm hover:bg-accent transition-colors min-h-[2px]" 
                      style={{ height: `${Math.max(height, 2)}%` }}
                    />
                    <span className="text-[8px] technical-label opacity-30">
                      {new Date(d.date).toLocaleDateString('en-US', { weekday: 'short' })}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-sm text-muted opacity-40 py-8 text-center">No match data for this period.</div>
          )}
        </div>

        {/* Recent Matches */}
        <div className="bg-white/[0.02] border border-border-custom rounded-xl p-6 flex flex-col gap-4">
          <h3 className="technical-label text-xs opacity-60 uppercase tracking-widest">Recent Matches</h3>
          <div className="flex flex-col gap-2">
            {(stats.recentMatches || []).slice(0, 6).map((m: any) => (
              <Link 
                key={m.id} 
                href={`/matches/${m.id}`}
                className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/5 transition-colors group"
              >
                <div className="flex items-center gap-3 text-xs min-w-0">
                  <span className="truncate font-medium">{m.challengerEngine?.name}</span>
                  <span className="opacity-20 shrink-0">vs</span>
                  <span className="truncate font-medium">{m.defenderEngine?.name}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-[9px] technical-label uppercase font-bold ${
                    m.status === 'completed' ? 'text-accent' :
                    m.status === 'running' ? 'text-yellow-400' :
                    m.status === 'failed' ? 'text-red-500' : 'opacity-40'
                  }`}>{m.status}</span>
                  <ChevronRight size={12} className="opacity-0 group-hover:opacity-40 transition-opacity" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// TAB: Users
// ============================================================
function UsersTab({ users }: { users: any[] }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-3"><Users size={18} className="text-blue-400" /> All Users</h2>
        <span className="technical-label opacity-40">{users.length} registered</span>
      </div>

      <div className="bg-white/[0.02] border border-border-custom rounded-xl overflow-hidden">
        {/* Desktop Header */}
        <div className="hidden sm:grid grid-cols-[1fr_120px_100px_100px_150px] gap-4 px-6 py-3 border-b border-border-custom technical-label text-[10px] opacity-40 uppercase">
          <span>User</span>
          <span>Role</span>
          <span>Engines</span>
          <span>Submissions</span>
          <span>Joined</span>
        </div>

        {users.map(user => (
          <div key={user.id} className="grid grid-cols-1 sm:grid-cols-[1fr_120px_100px_100px_150px] gap-2 sm:gap-4 px-4 sm:px-6 py-4 border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
            <Link href={`/users/${user.username || user.id}`} className="flex items-center gap-3 min-w-0">
              {user.image ? (
                <img src={user.image} alt="" className="w-7 h-7 rounded-full border border-white/10 shrink-0" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-white/5 border border-white/10 shrink-0" />
              )}
              <div className="min-w-0">
                <div className="text-sm font-bold truncate hover:text-accent transition-colors">{user.username || user.name || 'Anonymous'}</div>
                <div className="text-[10px] technical-label opacity-30 truncate">{user.id}</div>
              </div>
            </Link>
            <div className="flex items-center">
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                user.role === 'admin' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-white/5 text-white/40'
              }`}>{user.role}</span>
            </div>
            <div className="flex items-center">
              <span className="font-mono text-sm">{user._count?.engines || 0}</span>
            </div>
            <div className="flex items-center">
              <span className="font-mono text-sm">{user._count?.submissions || 0}</span>
            </div>
            <div className="flex items-center">
              <span className="text-xs text-muted">{new Date(user.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// TAB: Engines
// ============================================================
function EnginesTab({ engines, onStatusChange, onDelete, actionLoading }: { 
  engines: any[]; 
  onStatusChange: (id: string, status: string) => void;
  onDelete: (id: string, name: string) => void;
  actionLoading: string | null;
}) {
  const statusOptions = ['active', 'pending', 'disabled', 'banned', 'rejected'];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-3"><Cpu size={18} className="text-purple-400" /> All Engines</h2>
        <span className="technical-label opacity-40">{engines.length} total</span>
      </div>

      <div className="flex flex-col gap-3">
        {engines.map(engine => (
          <div key={engine.id} className="bg-white/[0.02] border border-border-custom rounded-xl p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
            {/* Engine Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <Link href={`/engines/${engine.slug}`} className="font-bold text-sm hover:text-accent transition-colors truncate">
                  {engine.name}
                </Link>
                <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border shrink-0 ${
                  engine.status === 'active' ? 'text-accent border-accent/20 bg-accent/5' :
                  engine.status === 'banned' ? 'text-red-500 border-red-500/20 bg-red-500/5' :
                  engine.status === 'pending' ? 'text-yellow-500 border-yellow-500/20 bg-yellow-500/5' :
                  'text-muted border-border-custom'
                }`}>{engine.status}</span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[10px] technical-label opacity-40">
                <span>@{engine.owner?.username}</span>
                <span>•</span>
                <span>{engine.currentRating} ELO</span>
                <span>•</span>
                <span>{engine.wins}W / {engine.losses}L / {engine.draws}D</span>
                <span>•</span>
                <span>{engine._count?.matchesChallenged + engine._count?.matchesDefended} matches</span>
                {engine.versions?.[0] && (
                  <>
                    <span>•</span>
                    <span>{engine.versions[0].language?.toUpperCase()}</span>
                    <span>•</span>
                    <span className={engine.versions[0].validationStatus === 'passed' ? 'text-accent' : engine.versions[0].validationStatus === 'failed' ? 'text-red-400' : ''}>
                      build: {engine.versions[0].validationStatus}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <select
                value={engine.status}
                onChange={(e) => onStatusChange(engine.id, e.target.value)}
                disabled={actionLoading === engine.id}
                className="bg-white/5 border border-white/10 text-sm px-3 py-1.5 rounded-lg text-white/80 disabled:opacity-40 appearance-none cursor-pointer"
              >
                {statusOptions.map(s => (
                  <option key={s} value={s} className="bg-neutral-900">{s}</option>
                ))}
              </select>
              <button
                onClick={() => onDelete(engine.id, engine.name)}
                disabled={actionLoading === engine.id}
                className="p-2 text-red-500/40 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all disabled:opacity-20"
                title="Delete engine"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// TAB: Jobs
// ============================================================
function JobsTab({ jobs, onRetry, actionLoading }: { 
  jobs: any[]; 
  onRetry: (id: string) => void;
  actionLoading: string | null;
}) {
  const statusColor = (s: string) => {
    switch (s) {
      case 'completed': return 'text-accent';
      case 'failed': return 'text-red-500';
      case 'processing': return 'text-yellow-400';
      case 'pending': return 'text-cyan-400';
      default: return 'text-muted';
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-3"><Wrench size={18} className="text-cyan-400" /> Job Queue</h2>
        <span className="technical-label opacity-40">{jobs.length} recent</span>
      </div>

      <div className="bg-white/[0.02] border border-border-custom rounded-xl overflow-hidden">
        {jobs.map(job => (
          <div key={job.id} className="flex flex-col sm:flex-row sm:items-center justify-between px-4 sm:px-6 py-4 border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <span className="text-sm font-bold font-mono">{job.jobType}</span>
                <span className={`text-[9px] font-bold uppercase tracking-wider ${statusColor(job.status)}`}>{job.status}</span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[10px] technical-label opacity-30">
                <span>ID: {job.id.substring(0, 8)}</span>
                <span>•</span>
                <span>Attempts: {job.attempts}</span>
                <span>•</span>
                <span>{new Date(job.createdAt).toLocaleString()}</span>
                {job.lastError && (
                  <>
                    <span>•</span>
                    <span className="text-red-400 truncate max-w-[300px]">{job.lastError}</span>
                  </>
                )}
              </div>
            </div>
            {job.status === 'failed' && (
              <button
                onClick={() => onRetry(job.id)}
                disabled={actionLoading === job.id}
                className="px-3 py-1.5 bg-white/5 border border-white/10 text-xs font-medium hover:bg-white/10 transition-colors flex items-center gap-2 rounded-lg shrink-0 disabled:opacity-40"
              >
                <RefreshCw size={12} className={actionLoading === job.id ? 'animate-spin' : ''} /> Retry
              </button>
            )}
          </div>
        ))}

        {jobs.length === 0 && (
          <div className="py-16 text-center text-sm text-muted opacity-40">No jobs recorded.</div>
        )}
      </div>
    </div>
  );
}
