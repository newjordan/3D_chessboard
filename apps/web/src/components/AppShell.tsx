"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Providers from "@/components/Providers";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Toaster } from "sonner";

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPathResolved = pathname != null;
  const isDevLab = !isPathResolved || pathname.startsWith("/dev/");

  if (isDevLab) {
    return <>{children}</>;
  }

  return (
    <Providers>
      <Navbar />
      <main className="pt-24 min-h-screen">{children}</main>
      <Footer />
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          className: "bg-black/80 border border-white/10 backdrop-blur-xl text-white font-sans",
        }}
      />
    </Providers>
  );
}
