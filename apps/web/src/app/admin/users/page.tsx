"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { ApiClient } from "@/lib/apiClient";
import Image from "next/image";
import { toast } from "sonner";
import { 
  Shield, 
  User as UserIcon, 
  Edit2, 
  X,
  Mail,
  Calendar,
  Cpu
} from "lucide-react";

export default function UsersAdmin() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<any>(null);

  const fetchUsers = async () => {
    if (session?.user) {
      try {
        const data = await ApiClient.getAdminUsers((session.user as any).id);
        setUsers(data);
      } catch (err) {
        toast.error("Failed to fetch user list");
      } finally {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [session]);

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    try {
      await ApiClient.updateAdminUser((session?.user as any).id, editingUser.id, {
        role: editingUser.role,
        name: editingUser.name,
        username: editingUser.username
      });
      toast.success("User updated successfully");
      setEditingUser(null);
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message || "Update failed");
    }
  };

  if (loading) return <div className="text-white/20 px-8 py-12">Loading registry...</div>;

  return (
    <div className="space-y-12 relative min-h-screen">
      <header>
        <h1 className="text-4xl font-black tracking-tight text-white mb-2">User Registry</h1>
        <p className="text-white/40 font-medium">Manage permissions and view developer activity.</p>
      </header>

      <div className="overflow-hidden rounded-[2rem] bg-black/40 border border-white/5 backdrop-blur-xl">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-white/5 uppercase font-mono text-[10px] tracking-widest text-white/30">
              <th className="px-8 py-6">User</th>
              <th className="px-8 py-6">Role</th>
              <th className="px-8 py-6 text-right">Engines</th>
              <th className="px-8 py-6 text-right">Joined</th>
              <th className="px-8 py-6 text-right w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {users.map((user) => (
              <tr key={user.id} className="group hover:bg-white/[0.02] transition-colors">
                <td className="px-8 py-6">
                  <div className="flex items-center gap-4">
                    <div className="relative w-10 h-10 rounded-full overflow-hidden bg-white/5 border border-white/10 group-hover:border-purple-500/50 transition-colors">
                      {user.image ? (
                        <Image src={user.image} alt={user.username || "User"} fill className="object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs font-bold text-white/20 uppercase">
                          {(user.username || "U").charAt(0)}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="font-bold text-white group-hover:text-purple-400 transition-colors">
                        {user.username || "Anonymous"}
                      </p>
                      <p className="text-xs text-white/30 font-mono tracking-tighter truncate w-48">{user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-8 py-6">
                  <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                    user.role === 'admin' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-white/5 text-white/40 border border-white/10'
                  }`}>
                    {user.role}
                  </span>
                </td>
                <td className="px-8 py-6 text-right font-mono text-white/60">
                  {user._count?.engines || 0}
                </td>
                <td className="px-8 py-6 text-right font-mono text-xs text-white/20">
                  {new Date(user.createdAt).toLocaleDateString()}
                </td>
                <td className="px-8 py-6 text-right">
                  <button 
                    onClick={() => setEditingUser(user)}
                    className="p-2 rounded-lg hover:bg-white/10 text-white/10 hover:text-white transition-all"
                  >
                    <Edit2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Slide-over */}
      {editingUser && (
        <div className="fixed inset-0 z-[100] flex justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditingUser(null)}></div>
          <div className="w-full max-w-lg bg-[#0D0D0D] border-l border-white/10 h-full p-12 relative animate-in slide-in-from-right duration-300">
            <button 
              onClick={() => setEditingUser(null)}
              className="absolute top-8 right-8 p-3 rounded-full hover:bg-white/5 text-white/20 hover:text-white transition-all"
            >
              <X size={24} />
            </button>

            <div className="mb-12 flex items-center gap-6">
              <div className="relative w-20 h-20 rounded-3xl overflow-hidden border-2 border-purple-500/30">
                {editingUser.image ? (
                  <Image src={editingUser.image} alt="User" fill className="object-cover" />
                ) : (
                  <div className="w-full h-full bg-white/5 flex items-center justify-center text-2xl font-black text-white/20 uppercase">
                    {(editingUser.username || "U").charAt(0)}
                  </div>
                )}
              </div>
              <div>
                <h2 className="text-3xl font-black text-white">{editingUser.username || "Developer"}</h2>
                <p className="text-white/40 text-sm flex items-center gap-2 mt-1 lowercase">
                  <Mail size={14} /> {editingUser.email}
                </p>
              </div>
            </div>

            <form onSubmit={handleUpdateUser} className="space-y-8">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest font-bold text-white/30 ml-1">Access Level</label>
                <div className="grid grid-cols-2 gap-4">
                  <RoleCard 
                    active={editingUser.role === 'user'} 
                    onClick={() => setEditingUser({...editingUser, role: 'user'})}
                    icon={<UserIcon size={20} />}
                    label="User"
                    desc="Standard developer access"
                  />
                  <RoleCard 
                    active={editingUser.role === 'admin'} 
                    onClick={() => setEditingUser({...editingUser, role: 'admin'})}
                    icon={<Shield size={20} />}
                    label="Admin"
                    desc="Full platform control"
                  />
                </div>
              </div>

              <div className="space-y-4 pt-4">
                <div className="p-6 rounded-2xl bg-white/5 border border-white/10 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/40 flex items-center gap-2">
                      <Cpu size={14} /> Registered Engines
                    </span>
                    <span className="text-sm font-bold text-white">{editingUser._count?.engines || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/40 flex items-center gap-2">
                      <Calendar size={14} /> Joined Arena
                    </span>
                    <span className="text-sm font-bold text-white">{new Date(editingUser.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <button 
                  type="submit"
                  className="w-full py-5 rounded-[2rem] bg-gradient-to-r from-purple-600 to-blue-600 text-white font-black text-sm uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-purple-500/20"
                >
                  Apply Permissions
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function RoleCard({ active, onClick, icon, label, desc }: any) {
  return (
    <div 
      onClick={onClick}
      className={`p-4 rounded-2xl border cursor-pointer transition-all ${
        active 
          ? 'bg-purple-500/10 border-purple-500/50 text-white' 
          : 'bg-white/5 border-white/5 text-white/40 hover:border-white/20'
      }`}
    >
      <div className={`mb-3 ${active ? 'text-purple-400' : 'text-white/20'}`}>{icon}</div>
      <p className="text-sm font-bold mb-1">{label}</p>
      <p className="text-[10px] leading-tight opacity-60">{desc}</p>
    </div>
  );
}
