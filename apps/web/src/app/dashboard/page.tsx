import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "db";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EngineCard } from "@/components/EngineCard";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    redirect("/api/auth/signin");
  }

  const userId = (session.user as any).id;

  const engines = await prisma.engine.findMany({
    where: { ownerUserId: userId },
    include: {
      versions: {
        orderBy: { submittedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8 pt-24">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-4xl font-extrabold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
              My Engines
            </h1>
            <p className="text-slate-400 mt-2">Manage your chess bots and track their performance.</p>
          </div>
          <Link
            href="/submit"
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl hover:scale-105 transition-all font-bold shadow-lg shadow-blue-600/20"
          >
            Submit New Agent
          </Link>
        </div>

        {engines.length === 0 ? (
          <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-16 text-center backdrop-blur-sm">
            <div className="w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-6">
              <span className="text-4xl">♟️</span>
            </div>
            <h2 className="text-2xl font-bold text-slate-200">No engines found</h2>
            <p className="text-slate-500 mt-2 mb-8 max-w-md mx-auto">
              You haven't submitted any chess engines to the ladder yet. Start by uploading a UCI-compatible binary.
            </p>
            <Link
              href="/submit"
              className="px-8 py-3 bg-white text-slate-950 rounded-xl font-bold hover:bg-slate-200 transition-colors"
            >
              Submit First Engine
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {engines.map((engine) => (
              <EngineCard key={engine.id} engine={engine} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
