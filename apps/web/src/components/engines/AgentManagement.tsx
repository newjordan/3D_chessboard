"use client";

import React, { useState } from 'react';
import { Trash2, AlertTriangle, Loader2, Play, Pause, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ApiClient } from '@/lib/apiClient';

interface AgentManagementProps {
  engineId: string;
  userId: string;
  status: string;
}

export function AgentManagement({ engineId, userId, status }: AgentManagementProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleToggleStatus = async () => {
    setIsToggling(true);
    setError(null);
    const targetStatus = status === 'active' ? 'disabled_by_owner' : 'active';
    
    try {
      const resp = await ApiClient.updateEngineStatus(engineId, targetStatus, userId);
      if (resp.success) {
        router.refresh();
      } else {
        setError(resp.message || "Failed to update status");
      }
    } catch (e: any) {
      setError(e.message || "Failed to update status");
    } finally {
      setIsToggling(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      const resp = await ApiClient.deleteEngine(engineId, userId);
      if (resp.success) {
        router.push('/leaderboard');
        router.refresh();
      } else {
        setError(resp.message || "Deletion failed");
      }
    } catch (e: any) {
      setError(e.message || "Deletion failed");
    } finally {
      setIsDeleting(false);
      setShowConfirm(false);
    }
  };

  const nextStatusLabel = status === 'active' ? 'Deactivate from Arena' : 'Activate for Arena';
  const Icon = status === 'active' ? Pause : Play;

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-[10px] font-bold uppercase animate-in fade-in slide-in-from-top-1">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-center gap-3">
        <button 
          onClick={handleToggleStatus}
          disabled={isToggling || isDeleting}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border transition-all rounded text-[11px] technical-label font-bold uppercase tracking-widest disabled:opacity-50 ${
            status === 'active' 
              ? 'bg-amber-950/20 border-amber-900/30 text-amber-500 hover:bg-amber-950/40' 
              : 'bg-accent/10 border-accent/30 text-accent hover:bg-accent/20'
          }`}
        >
          {isToggling ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
          {nextStatusLabel}
        </button>

        <button 
          onClick={() => setShowConfirm(true)}
          disabled={isDeleting || isToggling}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-950/20 border border-red-900/30 text-red-500 hover:bg-red-950/40 transition-all rounded text-[11px] technical-label font-bold uppercase tracking-widest disabled:opacity-50"
        >
          {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          Decommission Agent
        </button>
      </div>

      {showConfirm && (
        <div className="p-4 border border-red-900/20 bg-red-950/10 rounded flex flex-col gap-4 animate-in fade-in slide-in-from-top-2">
           <div className="flex items-start gap-3">
             <AlertTriangle size={16} className="text-red-500 mt-0.5" />
             <div className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-red-200 uppercase tracking-tight">Confirm Destruction?</span>
                <p className="text-[10px] text-red-200/60 leading-relaxed font-medium">
                  Deleting this agent will permanently erase its history, rating, and all submitted versions.
                </p>
             </div>
           </div>
           <div className="flex gap-2">
              <button 
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white font-bold text-[10px] uppercase rounded transition-colors"
              >
                Confirm Delete
              </button>
              <button 
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-white/60 font-medium text-[10px] uppercase rounded transition-colors"
              >
                Cancel
              </button>
           </div>
        </div>
      )}
    </div>
  );
}
