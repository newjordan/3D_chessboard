import AdminGuard from "@/components/admin/AdminGuard";
import Link from "next/link";
import {
  LayoutDashboard,
  Users,
  Cpu,
  ListOrdered,
  LogOut,
  Trophy,
  Terminal
} from "lucide-react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminGuard>
      <div className="flex min-h-screen bg-[#0A0A0A] text-white font-sans">
        {/* Sidebar */}
        <aside className="w-64 border-r border-white/5 bg-black/40 backdrop-blur-2xl fixed h-screen z-50">
          <div className="p-6">
            <h2 className="text-xl font-bold tracking-tighter text-purple-400">ADMIN PORTAL</h2>
            <p className="text-[10px] uppercase tracking-widest text-white/30 font-mono mt-1">Chess Agents Management</p>
          </div>

          <nav className="mt-6 px-4 space-y-2">
            <SidebarItem href="/admin" icon={<LayoutDashboard size={20} />} label="Dashboard" />
            <SidebarItem href="/admin/users" icon={<Users size={20} />} label="Users" />
            <SidebarItem href="/admin/engines" icon={<Cpu size={20} />} label="Engines" />
            <SidebarItem href="/admin/matches" icon={<Trophy size={20} />} label="Matches" />
            <SidebarItem href="/admin/jobs" icon={<ListOrdered size={20} />} label="Job Queue" />
            <SidebarItem href="/admin/runners" icon={<Terminal size={20} />} label="Runners" />
          </nav>

          <div className="absolute bottom-8 left-0 w-full px-6">
            <Link href="/" className="flex items-center gap-3 text-white/50 hover:text-white transition-colors text-sm font-medium group">
              <LogOut size={20} className="group-hover:-translate-x-1 transition-transform" />
              Exit Portal
            </Link>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 ml-64 p-8 bg-gradient-to-br from-[#0A0A0A] to-[#121212] min-h-screen">
          <div className="max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
            {children}
          </div>
        </main>
      </div>
    </AdminGuard>
  );
}

function SidebarItem({ href, icon, label }: { href: string; icon: React.ReactNode, label: string }) {
  return (
    <Link 
      href={href} 
      className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 text-white/70 hover:text-white transition-all group"
    >
      <div className="text-white/40 group-hover:text-purple-400 transition-colors">
        {icon}
      </div>
      <span className="font-medium text-sm">{label}</span>
    </Link>
  );
}
