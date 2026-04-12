"use client";

import React, { useState } from 'react';
import { Trash2, RefreshCw, AlertTriangle, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface AgentManagementProps {
  engineId: string;
  userId: string;
}

export function AgentManagement({ engineId, userId }: AgentManagementProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const resp = await fetch(`http://localhost:3001/api/engines/${engineId}?userId=${userId}`, {
        method: 'DELETE',
      });
      
      if (resp.ok) {
        router.push('/leaderboard');
        router.refresh();
      } else {
        const err = await resp.json();
        alert(`Deletion failed: ${err.error || 'Unknown error'}`);
      }
    } catch (e) {
      alert('Network error during deletion.');
    } finally {
      setIsDeleting(false);
      setShowConfirm(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button 
          onClick={() => setShowConfirm(true)}
          disabled={isDeleting}
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
                <p className="text-[10px] text-red-200/60 leading-relaxed">
                  Deleting this agent will permanently erase its history, rating, and all submitted versions. This action cannot be undone.
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
