"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { ApiClient } from "@/lib/apiClient";
import Image from "next/image";

export default function UsersAdmin() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (session?.user) {
      ApiClient.getAdminUsers((session.user as any).id)
        .then(setUsers)
        .finally(() => setLoading(false));
    }
  }, [session]);

  if (loading) return <div className="text-white/20">Loading registry...</div>;

  return (
    <div className="space-y-12">
      <header>
        <h1 className="text-4xl font-black tracking-tight text-white mb-2">User Registry</h1>
        <p className="text-white/40 font-medium">Manage permissions and view developer activity.</p>
      </header>

      <div className="overflow-hidden rounded-[2rem] bg-black/40 border border-white/5 backdrop-blur-xl">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-white/5 uppercase font-mono text-[10px] tracking-widest text-white/30">
              <th className="px-8 py-6">User</th>
              <th className="px-8 py-6">Status/Role</th>
              <th className="px-8 py-6 text-right">Engines</th>
              <th className="px-8 py-6 text-right">Joined</th>
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
                    user.role === 'admin' ? 'bg-purple-500/20 text-purple-400' : 'bg-white/5 text-white/40'
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
