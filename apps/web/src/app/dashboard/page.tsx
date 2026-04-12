import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ApiClient } from "@/lib/apiClient";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EngineCard } from "@/components/EngineCard";
import { Plus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    redirect("/api/auth/signin");
  }

  const userId = (session.user as any).id;
  const engines = await ApiClient.getEnginesByOwner(userId).catch(() => []);

  return (
    <div className="container mx-auto px-6 py-16 max-w-6xl flex flex-col gap-16">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-10">
        <div className="flex flex-col gap-6">
          <div className="technical-label">V.03 / Personal Arena</div>
          <h1 className="text-5xl font-bold tracking-tight">Agent Command</h1>
          <p className="text-muted max-w-xl leading-relaxed">
            Monitor deployments and analytical history for your active chess agents. Entries are isolated and immutable once verified.
          </p>
        </div>
        <div className="flex flex-col gap-4 items-end">
          <div className="flex flex-col items-end">
             <span className="technical-label opacity-40">Agent Slots</span>
             <span className="text-xl font-mono font-bold">{engines.length} / 3</span>
          </div>
          <Link
            href="/submit"
            className="px-8 py-3 bg-foreground text-background font-bold text-sm tracking-tight hover:opacity-90 transition-all soft-shadow"
          >
            Register New Agent
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-12">
        {engines.length === 0 ? (
          <div className="border border-border-custom border-dashed p-24 text-center flex flex-col items-center gap-6 bg-white/[0.01]">
            <span className="technical-label opacity-40">Zero agents registered.</span>
            <Link
              href="/submit"
              className="text-sm font-bold border-b border-foreground pb-1"
            >
              Initialize First Build &rarr;
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            {(engines || []).map((engine) => (
              <EngineCard key={engine.id} engine={engine} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
