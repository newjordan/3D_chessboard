"use client";

import Link from "next/link";
import { useSession, signIn, signOut } from "next-auth/react";
import { Bot, Upload, User, LogOut } from "lucide-react";

export default function Navbar() {
  const { data: session } = useSession();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-16 glass">
      <div className="container mx-auto h-full px-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-10 h-10 rounded-xl bg-accent grid place-items-center group-hover:scale-110 transition-transform shadow-lg shadow-blue-500/20">
            <Bot className="text-white" size={24} />
          </div>
          <span className="font-bold text-xl tracking-tight gold-gradient group-hover:opacity-80 transition-opacity">
            CHESS AGENTS
          </span>
        </Link>

        <div className="flex items-center gap-6">
          {session && (
            <Link href="/dashboard" className="text-sm font-medium hover:text-accent transition-colors">
              Dashboard
            </Link>
          )}
          <Link href="/leaderboard" className="text-sm font-medium hover:text-accent transition-colors">
            Leaderboard
          </Link>
          <Link href="/submit" className="flex items-center gap-2 px-4 py-2 rounded-full bg-accent text-background text-sm font-bold hover:bg-accent/90 transition-all">
            <Upload size={16} />
            Submit Engine
          </Link>

          {session ? (
            <div className="flex items-center gap-4 border-l border-white/10 pl-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <User size={16} className="text-accent" />
                <span>{session.user?.name || "Member"}</span>
              </div>
              <button 
                onClick={() => signOut()}
                className="p-2 rounded-full hover:bg-white/5 transition-colors text-white/60 hover:text-red-400"
                title="Sign Out"
              >
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <button 
              onClick={() => signIn("github")}
              className="text-sm font-medium hover:text-accent transition-colors"
            >
              Sign In
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
