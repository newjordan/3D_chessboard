"use client";

import Link from "next/link";
import { ChevronRight, Github, MessageSquare } from "lucide-react";

export default function Footer() {
  return (
    <footer className="border-t border-border-custom bg-background pb-12 pt-16">
      <div className="container mx-auto px-4 sm:px-6 max-w-5xl">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-12 sm:gap-8">
          {/* Logo & Info */}
          <div className="col-span-2 flex flex-col gap-6">
            <Link href="/" className="flex items-center gap-3">
              <span className="font-bold text-sm tracking-tight uppercase">
                Chess Agents
              </span>
              <span className="technical-label opacity-40">/ Arena</span>
            </Link>
            <p className="text-sm text-muted max-w-xs leading-relaxed">
              A competitive high-performance arena for autonomous chess engines. 
              Built for the next generation of AI development.
            </p>
            <div className="flex items-center gap-4 pt-2">
              <Link
                href="https://www.reddit.com/r/ChessAgents"
                target="_blank"
                className="p-2.5 bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all rounded-lg text-white/40 hover:text-[#FF4500]"
                title="Reddit Community"
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M16.5 9.5c0-.82-.67-1.5-1.5-1.5-.25 0-.48.07-.68.18-1.22-.88-2.88-1.45-4.72-1.5L10.5 3l3 .7c.05.5.47.9.98.9 1.1 0 2-.9 2-2s-.9-2-2-2c-.8 0-1.48.47-1.79 1.14L9.5 1c-.13-.03-.27.02-.35.13-.08.1-.11.23-.07.35l1.1 4.7c-1.89.04-3.6.61-4.85 1.5-.2-.11-.43-.18-.68-.18-.83 0-1.5.67-1.5 1.5 0 .58.33 1.08.82 1.33-.1.38-.15.77-.15 1.17 0 2.76 3.65 5 8.16 5 4.5 0 8.16-2.24 8.16-5 0-.4-.05-.79-.15-1.17.49-.25.82-.75.82-1.33zm-9.33 3c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm5.66 2.5c-1.07 1.07-3.12 1.15-3.66 1.15s-2.59-.08-3.66-1.15c-.15-.15-.15-.38 0-.53.15-.15.38-.15.53 0 .86.86 2.51.93 3.13.93s2.27-.07 3.13-.93c.15-.15.38-.15.53 0 .15.15.15.38 0 .53zm-.33-2.5c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z" />
                </svg>
              </Link>
              <Link
                href="https://discord.gg/gXtgN8rEM8"
                target="_blank"
                className="p-2.5 bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all rounded-lg text-white/40 hover:text-[#5865F2]"
                title="Discord Server"
              >
                <svg width="18" height="18" viewBox="0 0 127.14 96.36" fill="currentColor">
                  <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.71,32.65-1.82,56.6.48,80.21a105.73,105.73,0,0,0,32.22,16.15,77.7,77.7,0,0,0,7.34-11.85,68.18,68.18,0,0,1-11.85-5.65c.98-.71,1.93-1.46,2.83-2.23a74.13,74.13,0,0,0,65.17,0c.9.77,1.85,1.52,2.83,2.23a67.8,67.8,0,0,1-11.85,5.65,76.92,76.92,0,0,0,7.34,11.85,105.39,105.39,0,0,0,32.32-16.14C129.58,52.84,124.93,29.17,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5.07-12.67,11.45-12.67S54,46,53.86,53,48.81,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5.07-12.67,11.44-12.67S96.21,46,96.07,53,91,65.69,84.69,65.69Z" />
                </svg>
              </Link>
              <Link
                href="https://github.com/jaymaart/chess-agents-issues/issues"
                target="_blank"
                className="p-2.5 bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all rounded-lg text-white/40 hover:text-white"
                title="GitHub Issues"
              >
                <Github size={18} />
              </Link>
            </div>
          </div>

          {/* Links 1 */}
          <div className="flex flex-col gap-6">
            <span className="technical-label text-[10px] text-foreground font-bold">Arena</span>
            <div className="flex flex-col gap-3">
              <Link href="/leaderboard" className="text-[13px] text-muted hover:text-accent transition-colors">Current Standings</Link>
              <Link href="/matches" className="text-[13px] text-muted hover:text-accent transition-colors">Recent Bout History</Link>
              <Link href="/submit" className="text-[13px] text-muted hover:text-accent transition-colors">Submit Agent</Link>
              <Link href="/arbiter" className="text-[13px] text-muted hover:text-accent transition-colors">Arbiter Network</Link>
            </div>
          </div>

          {/* Links 2 */}
          <div className="flex flex-col gap-6">
            <span className="technical-label text-[10px] text-foreground font-bold">Resources</span>
            <div className="flex flex-col gap-3">
              <Link href="https://github.com/jaymaart/chess-agents-issues/issues" target="_blank" className="text-[13px] text-muted hover:text-accent transition-colors">Report Issue</Link>
              <Link href="#" className="text-[13px] text-muted hover:text-accent transition-colors">Technical Docs</Link>
              <Link href="#" className="text-[13px] text-muted hover:text-accent transition-colors">Prize Terms</Link>
            </div>
          </div>
        </div>

        <div className="mt-20 pt-8 border-t border-border-custom flex flex-col sm:flex-row justify-between items-center gap-6">
          <div className="technical-label opacity-40 text-[9px]">
            Established 2026 / High-Performance AI Competition
          </div>
          <div className="flex items-center gap-6">
            <span className="technical-label opacity-40 text-[9px]">v.03 // stable</span>
            <span className="technical-label opacity-40 text-[9px]">© 2026 Chess Agents Team</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
