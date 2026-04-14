"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession, signIn, signOut } from "next-auth/react";
import { User, LogOut, ChevronRight, Menu, X } from "lucide-react";

export default function Navbar() {
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 h-14 bg-background border-b border-border-custom">
        <div className="container mx-auto h-full px-4 sm:px-6 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <span className="font-bold text-sm tracking-tight uppercase">
              Chess Agents
            </span>
            <span className="technical-label opacity-40">/ Arena</span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            <Link
              href="/submit"
              className="text-[13px] font-medium flex items-center gap-1 group"
            >
              Submit <ChevronRight size={14} className="opacity-40 group-hover:translate-x-0.5 transition-transform" />
            </Link>

            <Link
              href="/arbiter"
              className="text-[13px] font-bold transition-all"
              style={{
                color: "#00ff41",
                textShadow: "0 0 8px #00ff41, 0 0 20px #00ff4188",
              }}
            >
              Become an Arbiter
            </Link>

            <Link href="/leaderboard" className="text-[13px] font-medium hover:text-accent transition-colors">
              Leaderboard
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

          {/* Mobile Hamburger */}
          <button 
            className="md:hidden p-2 hover:bg-white/5 rounded-md transition-colors"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      {/* Mobile Slide-out Menu */}
      {menuOpen && (
        <div 
          className="fixed inset-0 z-40 md:hidden"
          onClick={() => setMenuOpen(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          
          {/* Panel */}
          <div 
            className="absolute top-14 right-0 w-72 max-w-[85vw] bg-background border-l border-border-custom flex flex-col h-[calc(100vh-3.5rem)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col p-6 gap-1 flex-1">
              <Link
                href="/submit"
                className="py-3 px-4 text-sm font-medium hover:bg-white/5 rounded-lg transition-colors flex items-center justify-between"
                onClick={() => setMenuOpen(false)}
              >
                Submit Agent
                <ChevronRight size={14} className="opacity-20" />
              </Link>
              <Link
                href="/arbiter"
                className="py-3 px-4 text-sm font-bold hover:bg-white/5 rounded-lg transition-colors flex items-center justify-between"
                style={{ color: "#00ff41", textShadow: "0 0 8px #00ff41, 0 0 20px #00ff4188" }}
                onClick={() => setMenuOpen(false)}
              >
                Become an Arbiter
                <ChevronRight size={14} className="opacity-20" />
              </Link>
              <Link
                href="/leaderboard"
                className="py-3 px-4 text-sm font-medium hover:bg-white/5 rounded-lg transition-colors flex items-center justify-between"
                onClick={() => setMenuOpen(false)}
              >
                Leaderboard
                <ChevronRight size={14} className="opacity-20" />
              </Link>
              <Link
                href="https://github.com/jaymaart/chess-agents-issues/issues" 
                target="_blank"
                className="py-3 px-4 text-sm font-medium opacity-60 hover:bg-white/5 rounded-lg transition-colors flex items-center justify-between"
                onClick={() => setMenuOpen(false)}
              >
                Report Issue
                <ChevronRight size={14} className="opacity-20" />
              </Link>
              <Link
                href="https://discord.gg/gXtgN8rEM8"
                target="_blank"
                className="py-3 px-4 text-sm font-medium opacity-60 hover:bg-white/5 rounded-lg transition-colors flex items-center gap-3"
                onClick={() => setMenuOpen(false)}
              >
                <svg width="16" height="16" viewBox="0 0 127.14 96.36" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.71,32.65-1.82,56.6.48,80.21a105.73,105.73,0,0,0,32.22,16.15,77.7,77.7,0,0,0,7.34-11.85,68.18,68.18,0,0,1-11.85-5.65c.98-.71,1.93-1.46,2.83-2.23a74.13,74.13,0,0,0,65.17,0c.9.77,1.85,1.52,2.83,2.23a67.8,67.8,0,0,1-11.85,5.65,76.92,76.92,0,0,0,7.34,11.85,105.39,105.39,0,0,0,32.32-16.14C129.58,52.84,124.93,29.17,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5.07-12.67,11.45-12.67S54,46,53.86,53,48.81,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5.07-12.67,11.44-12.67S96.21,46,96.07,53,91,65.69,84.69,65.69Z" />
                </svg>
                Join Discord
              </Link>
            </div>

            {/* Auth Section */}
            <div className="border-t border-border-custom p-6">
              {session ? (
                <div className="flex flex-col gap-3">
                  <Link 
                    href="/dashboard" 
                    className="flex items-center gap-3 py-3 px-4 hover:bg-white/5 rounded-lg transition-colors"
                    onClick={() => setMenuOpen(false)}
                  >
                    <div className="w-7 h-7 rounded-full bg-accent-muted flex items-center justify-center">
                      <User size={14} className="text-accent" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold">{session.user?.name || "Member"}</span>
                      <span className="text-[10px] technical-label opacity-40">Dashboard</span>
                    </div>
                  </Link>
                  <button 
                    onClick={() => { signOut(); setMenuOpen(false); }}
                    className="py-2 px-4 text-sm text-muted hover:text-red-500 transition-colors text-left flex items-center gap-2"
                  >
                    <LogOut size={14} /> Sign Out
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => { signIn("github"); setMenuOpen(false); }}
                  className="w-full py-3 px-4 bg-foreground text-background font-bold text-sm rounded-lg hover:opacity-90 transition-all"
                >
                  Sign in with GitHub
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
