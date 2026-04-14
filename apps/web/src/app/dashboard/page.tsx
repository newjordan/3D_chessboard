import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ApiClient } from "@/lib/apiClient";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EngineCard } from "@/components/EngineCard";
import { ArbiterTab } from "./ArbiterTab";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    redirect("/api/auth/signin");
  }

  const userId = (session.user as any).id;
  const { tab } = await searchParams;
  const activeTab = tab === "arbiter" ? "arbiter" : "agents";

  const [rawEngines, runnerKey, runnerKeyRequest] = await Promise.all([
    ApiClient.getEnginesByOwner(userId).catch(() => []),
    activeTab === "arbiter"
      ? ApiClient.getMyRunnerKey(userId).catch(() => null)
      : Promise.resolve(null),
    activeTab === "arbiter"
      ? ApiClient.getMyRunnerKeyRequest(userId).catch(() => null)
      : Promise.resolve(null),
  ]);

  const engines = [...rawEngines].sort((a: any, b: any) => {
    if (a.status === "active" && b.status !== "active") return -1;
    if (b.status === "active" && a.status !== "active") return 1;
    return 0;
  });

  return (
    <div className="container mx-auto px-6 py-16 max-w-6xl flex flex-col gap-12">

      {/* Header */}
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
            <span className="technical-label opacity-40">Active Agents</span>
            <span className="text-xl font-mono font-bold">{engines.length}</span>
          </div>
          {activeTab === "agents" && (
            <Link
              href="/submit"
              className="px-8 py-3 bg-foreground text-background font-bold text-sm tracking-tight hover:opacity-90 transition-all soft-shadow"
            >
              Register New Agent
            </Link>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border-custom">
        {[
          { id: "agents", label: "Agents" },
          { id: "arbiter", label: "Arbiter" },
        ].map((tab) => (
          <Link
            key={tab.id}
            href={tab.id === "agents" ? "/dashboard" : `/dashboard?tab=${tab.id}`}
            className={`px-5 py-3 text-sm font-mono tracking-tight border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-foreground text-foreground"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "agents" && (
        <div className="flex flex-col gap-12">
          {engines.length === 0 ? (
            <div className="border border-border-custom border-dashed p-24 text-center flex flex-col items-center gap-6 bg-white/[0.01]">
              <span className="technical-label opacity-40">Zero agents registered.</span>
              <Link href="/submit" className="text-sm font-bold border-b border-foreground pb-1">
                Initialize First Build &rarr;
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
              {engines.map((engine) => (
                <EngineCard key={engine.id} engine={engine} isOwner={true} />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "arbiter" && (
        <ArbiterTab runnerKey={runnerKey} runnerKeyRequest={runnerKeyRequest} userId={userId} />
      )}

    </div>
  );
}
