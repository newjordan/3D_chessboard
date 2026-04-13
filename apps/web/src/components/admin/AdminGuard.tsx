"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;

    if (!session || (session.user as any).role !== "admin") {
      router.push("/");
    }
  }, [session, status, router]);

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="w-12 h-12 border-4 border-t-purple-500 border-r-transparent border-b-purple-500 border-l-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!session || (session.user as any).role !== "admin") {
    return null;
  }

  return <>{children}</>;
}
