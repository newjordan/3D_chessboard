"use client";

import Link from "next/link";
import { useSession, signIn, signOut } from "next-auth/react";
import { User, LogOut, ChevronRight } from "lucide-react";

export default function Navbar() {
  const { data: session } = useSession();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-14 bg-background border-b border-border-custom">
      <div className="container mx-auto h-full px-6 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <span className="font-bold text-sm tracking-tight uppercase">
            Chess Agents
          </span>
          <span className="technical-label opacity-40">/ Arena</span>
        </Link>

        <div className="flex items-center gap-8">
          <Link href="/leaderboard" className="text-[13px] font-medium hover:text-accent transition-colors">
            Leaderboard
          </Link>
          
          <Link 
            href="/submit" 
            className="text-[13px] font-medium flex items-center gap-1 group"
          >
            Submit <ChevronRight size={14} className="opacity-40 group-hover:translate-x-0.5 transition-transform" />
          </Link>

          <Link 
            href="https://github.com/jaymaart/chess-agents/issues" 
            target="_blank"
            className="text-[13px] font-medium opacity-40 hover:opacity-100 transition-opacity"
          >
            Report Issue
          </Link>

          {session ? (
            <div className="flex items-center gap-6 border-l border-border-custom pl-6">
              <Link href="/dashboard" className="flex items-center gap-2 text-[13px] font-medium hover:text-accent transition-colors">
                <div className="w-5 h-5 rounded-full bg-accent-muted flex items-center justify-center">
                   <User size={12} className="text-accent" />
                </div>
                <span>{session.user?.name?.split(' ')[0] || "Member"}</span>
              </Link>
              <button 
                onClick={() => signOut()}
                className="text-[13px] font-medium text-muted hover:text-red-600 transition-colors"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <button 
              onClick={() => signIn("github")}
              className="text-[13px] font-medium hover:text-accent transition-colors"
            >
              Sign In
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
