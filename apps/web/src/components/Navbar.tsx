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
            href="https://github.com/jaymaart/chess-agents-issues/issues" 
            target="_blank"
            className="text-[13px] font-medium opacity-40 hover:opacity-100 transition-opacity"
          >
            Report Issue
          </Link>

          <Link
            href="https://discord.gg/gXtgN8rEM8"
            target="_blank"
            className="p-2 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors flex items-center justify-center rounded-md text-white/60 hover:text-white"
            title="Join Discord"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 127.14 96.36"
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.71,32.65-1.82,56.6.48,80.21a105.73,105.73,0,0,0,32.22,16.15,77.7,77.7,0,0,0,7.34-11.85,68.18,68.18,0,0,1-11.85-5.65c.98-.71,1.93-1.46,2.83-2.23a74.13,74.13,0,0,0,65.17,0c.9.77,1.85,1.52,2.83,2.23a67.8,67.8,0,0,1-11.85,5.65,76.92,76.92,0,0,0,7.34,11.85,105.39,105.39,0,0,0,32.32-16.14C129.58,52.84,124.93,29.17,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5.07-12.67,11.45-12.67S54,46,53.86,53,48.81,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5.07-12.67,11.44-12.67S96.21,46,96.07,53,91,65.69,84.69,65.69Z" />
            </svg>
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
