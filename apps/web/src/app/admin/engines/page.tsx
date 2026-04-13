"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { ApiClient } from "@/lib/apiClient";
import { toast } from "sonner";
import { 
  CheckCircle, 
  XCircle, 
  Ban,
  Archive,
  Play,
  Cpu
} from "lucide-react";

export default function EnginesAdmin() {
  const { data: session } = useSession();
  const [engines, setEngines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEngines = async () => {
    if (session?.user) {
      const data = await ApiClient.getAdminEngines((session.user as any).id);
      setEngines(data);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEngines();
  }, [session]);

  const handleStatusUpdate = async (id: string, newStatus: string) => {
    try {
      await ApiClient.adminUpdateEngineStatus(id, newStatus, (session?.user as any).id);
      toast.success(`Engine status updated to ${newStatus}`);
      fetchEngines();
    } catch (err: any) {
      toast.error(err.message || "Failed to update status");
    }
  };

  if (loading) return <div className="text-white/20 px-8 py-12">Fetching fleet status...</div>;

  return (
    <div className="space-y-12">
      <header>
        <h1 className="text-4xl font-black tracking-tight text-white mb-2">Engine Fleet</h1>
        <p className="text-white/40 font-medium">Control and monitor all active agents in the arena.</p>
      </header>

      <div className="grid grid-cols-1 gap-4">
        {engines.map((engine) => (
          <div key={engine.id} className="p-6 rounded-[2rem] bg-black/40 border border-white/5 backdrop-blur-xl flex items-center justify-between group hover:border-white/20 transition-all">
            <div className="flex items-center gap-6">
              <div className={`p-4 rounded-2xl bg-white/5 text-white/20 group-hover:text-${getStatusColor(engine.status)}-400 transition-colors`}>
                <Cpu className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white group-hover:text-purple-400 transition-colors">{engine.name}</h3>
                <p className="text-xs text-white/30 font-mono tracking-widest uppercase">
                  Owner: {engine.owner?.username} • Rating: {engine.currentRating}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className={`px-4 py-2 rounded-xl border border-white/5 text-[10px] uppercase tracking-widest font-black bg-white/[0.02] ${getStatusTextClass(engine.status)}`}>
                {engine.status}
              </div>
              
              <div className="flex items-center gap-1 ml-4 border-l border-white/10 pl-4">
                {engine.status !== 'active' && (
                  <ActionButton 
                    onClick={() => handleStatusUpdate(engine.id, 'active')}
                    icon={<Play size={20} className="text-green-500" />}
                    tooltip="Activate"
                  />
                )}
                {engine.status !== 'disabled' && (
                  <ActionButton 
                    onClick={() => handleStatusUpdate(engine.id, 'disabled')}
                    icon={<Archive size={20} className="text-white/40" />}
                    tooltip="Disable"
                  />
                )}
                {engine.status !== 'banned' && (
                  <ActionButton 
                    onClick={() => handleStatusUpdate(engine.id, 'banned')}
                    icon={<Ban size={20} className="text-red-500" />}
                    tooltip="Ban"
                  />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActionButton({ onClick, icon, tooltip }: any) {
  return (
    <button 
      onClick={onClick}
      className="p-3 rounded-xl hover:bg-white/10 transition-all text-white/20 hover:text-white relative group/btn"
      title={tooltip}
    >
      {icon}
    </button>
  );
}

function getStatusColor(status: string) {
  switch (status) {
    case 'active': return 'green';
    case 'pending': return 'blue';
    case 'banned': return 'red';
    case 'rejected': return 'orange';
    default: return 'gray';
  }
}

function getStatusTextClass(status: string) {
  switch (status) {
    case 'active': return 'text-green-500 border-green-500/20';
    case 'banned': return 'text-red-500 border-red-500/20';
    case 'pending': return 'text-blue-500 border-blue-500/20';
    default: return 'text-white/40 border-white/10';
  }
}
