"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { ApiClient } from '@/lib/apiClient';
import { Trophy, Zap, Activity, Shield, Code, ChevronRight, PieChart, Wallet } from 'lucide-react';
import Link from 'next/link';

export default function UserProfilePage() {
  const { handle } = useParams();
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const data = await ApiClient.getUserProfile(handle as string);
        setUser(data);
      } catch (e) {
        console.error("Failed to fetch profile", e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchUser();
  }, [handle]);

  const stats = useMemo(() => {
    if (!user) return null;
    
    // Use server-side stats with client-side fallbacks during deployment transition
    const s = user.stats || {};
    const wins = s.totalWins || 0;
    const losses = s.totalLosses || 0;
    const draws = s.totalDraws || 0;
    const totalMatches = wins + losses + draws;
    const winRate = totalMatches > 0 ? ((wins / totalMatches) * 100).toFixed(1) : "0.0";
    const topRating = s.peakRating || 1200;
    const winnings = (s.totalEarnings || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

    return { wins, losses, draws, totalMatches, winRate, topRating, winnings };
  }, [user]);

  if (isLoading) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="technical-label animate-pulse opacity-20">Accessing Developer Identity...</div>
    </div>
  );

  if (!user) return (
    <div className="min-h-screen bg-black py-24 text-center">
      <h1 className="text-4xl font-bold mb-4">404</h1>
      <p className="text-muted">Developer not found in the regional registry.</p>
      <Link href="/" className="mt-8 inline-block text-accent hover:underline">Return to Terminal</Link>
    </div>
  );

  return (
    <div className="min-h-screen bg-black pb-24">
      {/* Profile Header */}
      <div className="relative border-b border-border-custom bg-white/[0.01]">
        <div className="container mx-auto px-6 pt-24 pb-16 max-w-6xl">
          <div className="flex flex-col md:flex-row items-center md:items-end gap-10">
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-accent/50 to-purple-500/50 rounded-full blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
              <img 
                src={user.image || `https://api.dicebear.com/7.x/identicon/svg?seed=${user.id}`}
                alt={user.username}
                className="relative w-32 h-32 rounded-full border-2 border-white/10 grayscale-[0.5] group-hover:grayscale-0 transition-all cursor-pointer"
              />
            </div>
            
            <div className="flex-1 flex flex-col items-center md:items-start text-center md:text-left">
              <div className="flex items-baseline gap-3 mb-2">
                <h1 className="text-5xl font-bold tracking-tight text-foreground">{user.username}</h1>
                <span className="technical-label text-accent opacity-50 text-xs">Verified Developer</span>
              </div>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-sm text-muted">
                <span className="flex items-center gap-1.5"><Shield size={14} className="text-accent" /> Senior Architect</span>
                <span className="opacity-20">•</span>
                <span>Active since {new Date(user.createdAt).toLocaleDateString()}</span>
                <span className="opacity-20">•</span>
                <span className="font-mono text-[10px] opacity-30">REG_UID: {user.id.substring(0,8)}</span>
              </div>
            </div>

            <div className="flex flex-col gap-3">
               <button className="px-6 py-2.5 bg-white text-black font-bold rounded-lg hover:bg-neutral-200 transition-colors flex items-center gap-2">
                 Follow Developer <Zap size={16} fill="currentColor" />
               </button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-12 max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Sidebar Stats */}
          <div className="lg:col-span-1 flex flex-col gap-6">
            <div className="bg-white/[0.02] border border-border-custom rounded-2xl p-8 flex flex-col gap-8 soft-shadow">
              <h3 className="technical-label text-xs opacity-40 uppercase tracking-widest">Aggregate Performance</h3>
              
              <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                      <Trophy size={18} />
                    </div>
                    <div>
                      <div className="text-2xl font-bold tracking-tight">{stats?.wins}</div>
                      <div className="text-[10px] technical-label opacity-40 uppercase">Total Victories</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-mono text-accent">{stats?.winRate}%</div>
                    <div className="text-[9px] technical-label opacity-40 uppercase">Efficiency</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400">
                    <Zap size={18} />
                  </div>
                  <div>
                    <div className="text-2xl font-bold tracking-tight">{stats?.topRating}</div>
                    <div className="text-[10px] technical-label opacity-40 uppercase">Peak Rating</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                    <Wallet size={18} />
                  </div>
                  <div>
                    <div className="text-2xl font-bold tracking-tight text-emerald-400">{stats?.winnings}</div>
                    <div className="text-[10px] technical-label opacity-40 uppercase">Rewards Claimed</div>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-white/5 grid grid-cols-2 gap-4">
                 <div>
                   <div className="text-lg font-bold text-white/80">{stats?.totalMatches}</div>
                   <div className="text-[8px] technical-label opacity-40 uppercase leading-none">Battles Logged</div>
                 </div>
                 <div>
                   <div className="text-lg font-bold text-white/80">{user.engines.length}</div>
                   <div className="text-[8px] technical-label opacity-40 uppercase leading-none">Active Agents</div>
                 </div>
              </div>
            </div>

            <div className="bg-accent/5 border border-accent/20 rounded-2xl p-6 flex items-start gap-4">
               <Activity size={20} className="text-accent mt-1 shrink-0" />
               <div>
                 <h4 className="font-bold text-sm mb-1">Analytical Dominance</h4>
                 <p className="text-xs text-muted leading-relaxed">This developer maintains a win efficiency higher than 50% of the active leaderboard base.</p>
               </div>
            </div>
          </div>

          {/* Main Content: Agents List */}
          <div className="lg:col-span-2 flex flex-col gap-8">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold flex items-center gap-3">
                <Code className="text-accent" /> Agent Roster
              </h2>
              <div className="text-[10px] technical-label opacity-40">SORTED_BY: RANK_DESC</div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {user.engines.map((engine: any) => (
                <Link 
                  key={engine.id}
                  href={`/engines/${engine.slug}`}
                  className="group bg-white/[0.01] border border-border-custom hover:bg-white/[0.03] hover:border-accent/40 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between transition-all duration-300 soft-shadow"
                >
                  <div className="flex items-center gap-6 mb-4 sm:mb-0">
                    <div className="relative">
                      <div className="absolute inset-0 bg-accent/20 rounded-full blur-md opacity-0 group-hover:opacity-100 transition-opacity"></div>
                      <div className="relative w-14 h-14 bg-black border border-white/10 rounded-full flex items-center justify-center font-bold text-xl group-hover:text-accent transition-colors">
                        {engine.name[0]}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-xl font-bold group-hover:translate-x-1 transition-transform">{engine.name}</h4>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] technical-label text-accent font-bold uppercase">{engine.currentRating} ELO</span>
                        <span className="opacity-10">|</span>
                        <span className="text-[10px] technical-label opacity-40 uppercase">{engine.wins}W {engine.losses}L {engine.draws}D</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-8">
                    <div className="hidden md:flex flex-col items-end">
                       <span className="text-[9px] technical-label opacity-40 uppercase">Engagement</span>
                       <span className="text-sm font-mono">{engine._count.matchesChallenged + engine._count.matchesDefended} Matches</span>
                    </div>
                    <div className="w-10 h-10 border border-white/10 rounded-xl flex items-center justify-center group-hover:bg-accent group-hover:text-black transition-all">
                      <ChevronRight size={18} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {user.engines.length === 0 && (
              <div className="py-24 border-2 border-dashed border-white/5 rounded-3xl flex flex-col items-center justify-center text-center">
                 <div className="text-muted text-sm mb-4 italic px-8">This developer has not yet deployed any active analytical agents to the arena.</div>
                 <Link href="/engines/submit" className="text-accent technical-label text-xs hover:underline">Register New Agent</Link>
              </div>
            )}
            
          </div>

        </div>
      </div>
    </div>
  );
}
