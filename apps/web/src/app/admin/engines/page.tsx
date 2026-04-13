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
  Cpu,
  Edit2,
  X
} from "lucide-react";

export default function EnginesAdmin() {
  const { data: session } = useSession();
  const [engines, setEngines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingEngine, setEditingEngine] = useState<any>(null);

  const fetchEngines = async () => {
    if (session?.user) {
      try {
        const data = await ApiClient.getAdminEngines((session.user as any).id);
        setEngines(data);
      } catch (err) {
        toast.error("Failed to fetch engines");
      } finally {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchEngines();
  }, [session]);

  const handleStatusUpdate = async (id: string, newStatus: string) => {
    try {
      await ApiClient.setEngineStatus((session?.user as any).id, id, newStatus);
      toast.success(`Engine status updated to ${newStatus}`);
      fetchEngines();
    } catch (err: any) {
      toast.error(err.message || "Failed to update status");
    }
  };

  const handleUpdateMetadata = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEngine) return;

    try {
      await ApiClient.updateAdminEngine((session?.user as any).id, editingEngine.id, {
        name: editingEngine.name,
        slug: editingEngine.slug,
        currentRating: parseInt(editingEngine.currentRating),
        description: editingEngine.description,
        status: editingEngine.status,
      });
      toast.success("Engine updated successfully");
      setEditingEngine(null);
      fetchEngines();
    } catch (err: any) {
      toast.error(err.message || "Update failed");
    }
  };

  if (loading) return <div className="text-white/20 px-8 py-12">Fetching fleet status...</div>;

  return (
    <div className="space-y-12 relative min-h-screen">
      <header>
        <h1 className="text-4xl font-black tracking-tight text-white mb-2">Engine Fleet</h1>
        <p className="text-white/40 font-medium">Control and monitor all active agents in the arena.</p>
      </header>

      <div className="grid grid-cols-1 gap-4">
        {engines.map((engine) => (
          <div key={engine.id} className="p-6 rounded-[2rem] bg-black/40 border border-white/5 backdrop-blur-xl flex items-center justify-between group hover:border-white/20 transition-all">
            <div className="flex items-center gap-6">
              <div className={`p-4 rounded-2xl bg-white/5 text-white/20 group-hover:text-purple-400 transition-colors`}>
                <Cpu className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white group-hover:text-purple-400 transition-all flex items-center gap-3">
                  {engine.name}
                  <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded uppercase tracking-tighter text-white/30 font-mono">
                    {engine.slug}
                  </span>
                </h3>
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
                <ActionButton 
                  onClick={() => setEditingEngine(engine)}
                  icon={<Edit2 size={18} className="text-blue-400" />}
                  tooltip="Configure"
                />
                <div className="w-px h-6 bg-white/5 mx-1"></div>
                {engine.status !== 'active' && (
                  <ActionButton 
                    onClick={() => handleStatusUpdate(engine.id, 'active')}
                    icon={<Play size={18} className="text-green-500" />}
                    tooltip="Activate"
                  />
                )}
                {engine.status !== 'banned' && (
                  <ActionButton 
                    onClick={() => handleStatusUpdate(engine.id, 'banned')}
                    icon={<Ban size={18} className="text-red-500" />}
                    tooltip="Ban"
                  />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Edit Slide-over */}
      {editingEngine && (
        <div className="fixed inset-0 z-[100] flex justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditingEngine(null)}></div>
          <div className="w-full max-w-lg bg-[#0D0D0D] border-l border-white/10 h-full p-12 relative animate-in slide-in-from-right duration-300">
            <button 
              onClick={() => setEditingEngine(null)}
              className="absolute top-8 right-8 p-3 rounded-full hover:bg-white/5 text-white/20 hover:text-white transition-all"
            >
              <X size={24} />
            </button>

            <div className="mb-12">
              <h2 className="text-3xl font-black text-white mb-2">Configure Engine</h2>
              <p className="text-white/40 text-sm">Update metadata and administrative status for <span className="text-purple-400 font-bold">{editingEngine.name}</span>.</p>
            </div>

            <form onSubmit={handleUpdateMetadata} className="space-y-8">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest font-bold text-white/30 ml-1">Display Name</label>
                <input 
                  type="text"
                  value={editingEngine.name}
                  onChange={(e) => setEditingEngine({...editingEngine, name: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white focus:border-purple-500/50 outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-white/30 ml-1">Internal Slug</label>
                  <input 
                    type="text"
                    value={editingEngine.slug}
                    onChange={(e) => setEditingEngine({...editingEngine, slug: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white focus:border-purple-500/50 outline-none transition-all font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-white/30 ml-1">Arena Rating</label>
                  <input 
                    type="number"
                    value={editingEngine.currentRating}
                    onChange={(e) => setEditingEngine({...editingEngine, currentRating: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white focus:border-purple-500/50 outline-none transition-all font-mono"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest font-bold text-white/30 ml-1">System Status</label>
                <select 
                  value={editingEngine.status}
                  onChange={(e) => setEditingEngine({...editingEngine, status: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white focus:border-purple-500/50 outline-none transition-all appearance-none cursor-pointer"
                >
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="disabled">Disabled</option>
                  <option value="rejected">Rejected</option>
                  <option value="banned">Banned</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest font-bold text-white/30 ml-1">Description</label>
                <textarea 
                  value={editingEngine.description || ""}
                  onChange={(e) => setEditingEngine({...editingEngine, description: e.target.value})}
                  rows={4}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white focus:border-purple-500/50 outline-none transition-all resize-none text-sm"
                  placeholder="Engine technical background..."
                />
              </div>

              <div className="pt-6">
                <button 
                  type="submit"
                  className="w-full py-5 rounded-[2rem] bg-gradient-to-r from-purple-600 to-blue-600 text-white font-black text-sm uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-purple-500/20"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
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

function getStatusTextClass(status: string) {
  switch (status) {
    case 'active': return 'text-green-500 border-green-500/20';
    case 'banned': return 'text-red-500 border-red-500/20';
    case 'pending': return 'text-blue-500 border-blue-500/20';
    default: return 'text-white/40 border-white/10';
  }
}
