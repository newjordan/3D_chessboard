"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { ApiClient } from "@/lib/apiClient";
import { toast } from "sonner";
import { Shield, ShieldOff, Trash2, Terminal, Copy, CheckCircle, XCircle, Plus, X, Check, Swords } from "lucide-react";

export default function RunnersAdmin() {
  const { data: session } = useSession();
  const [runners, setRunners] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUserId, setNewUserId] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [oneTimeKey, setOneTimeKey] = useState<{ privateKey: string; label: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [requests, setRequests] = useState<any[]>([]);
  const [fulfillingId, setFulfillingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const userId = (session?.user as any)?.id;

  const fetchData = async () => {
    if (!userId) return;
    try {
      const [runnersData, usersData, requestsData] = await Promise.all([
        ApiClient.getAdminRunners(userId),
        ApiClient.getAdminUsers(userId),
        ApiClient.getAdminRunnerKeyRequests(userId),
      ]);
      setRunners(runnersData);
      setUsers(usersData);
      setRequests(requestsData);
    } catch {
      toast.error("Failed to load runners");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [session]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserId) return toast.error("Select a user");
    setCreating(true);
    try {
      const result = await ApiClient.createRunnerKey(userId, newUserId, newLabel || undefined);
      setOneTimeKey({ privateKey: result.privateKey, label: result.label || result.id });
      setNewUserId("");
      setNewLabel("");
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to create key");
    } finally {
      setCreating(false);
    }
  };

  const handleTrust = async (id: string, trusted: boolean) => {
    try {
      await ApiClient.setRunnerTrust(userId, id, trusted);
      toast.success(trusted ? "Runner trusted" : "Trust revoked");
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to update trust");
    }
  };

  const handleTogglePlacements = async (id: string, current: boolean) => {
    try {
      await ApiClient.setRunnerPlacements(userId, id, !current);
      toast.success(!current ? "Placement matches enabled" : "Placement matches disabled");
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to update");
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm("Revoke this runner key? This cannot be undone.")) return;
    try {
      await ApiClient.revokeRunnerKey(userId, id);
      toast.success("Runner key revoked");
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to revoke");
    }
  };

  const handleFulfill = async (requestId: string, requestUserId: string) => {
    setFulfillingId(requestId);
    try {
      const result = await ApiClient.fulfillRunnerKeyRequest(userId, requestId);
      setOneTimeKey({ privateKey: result.privateKey, label: result.label || result.id });
      fetchData();
      toast.success("Key generated and request fulfilled");
    } catch (err: any) {
      toast.error(err.message || "Failed to fulfill request");
    } finally {
      setFulfillingId(null);
    }
  };

  const handleReject = async (requestId: string) => {
    if (!confirm("Reject this key request?")) return;
    setRejectingId(requestId);
    try {
      await ApiClient.rejectRunnerKeyRequest(userId, requestId);
      fetchData();
      toast.success("Request rejected");
    } catch (err: any) {
      toast.error(err.message || "Failed to reject request");
    } finally {
      setRejectingId(null);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCloseModal = () => {
    if (!confirmed) {
      if (!confirm("You haven't confirmed you copied the key. Close anyway? The private key cannot be shown again.")) return;
    }
    setOneTimeKey(null);
    setConfirmed(false);
    setCopied(false);
  };

  if (loading) return <div className="text-white/40 text-sm font-mono">Loading...</div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Runner Keys</h1>
        <p className="text-white/40 text-sm mt-1 font-mono">Manage trusted community runner credentials</p>
      </div>

      {/* Pending Key Requests */}
      {requests.filter((r) => r.status === "pending").length > 0 && (
        <div className="bg-amber-400/5 border border-amber-400/20 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-amber-400/10 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-amber-400/80 uppercase tracking-widest">
              Pending Key Requests
            </h2>
            <span className="text-xs font-mono text-amber-400/60 bg-amber-400/10 px-2 py-0.5 rounded">
              {requests.filter((r) => r.status === "pending").length}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-amber-400/10 text-amber-400/40 text-xs uppercase tracking-widest font-mono">
                <th className="px-6 py-3 text-left">User</th>
                <th className="px-6 py-3 text-left">Note</th>
                <th className="px-6 py-3 text-left">Requested</th>
                <th className="px-6 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.filter((r) => r.status === "pending").map((r: any) => (
                <tr key={r.id} className="border-b border-amber-400/10 last:border-0">
                  <td className="px-6 py-4 text-white/70 font-mono text-xs">
                    {r.user?.username || r.user?.email || r.userId}
                  </td>
                  <td className="px-6 py-4 text-white/40 text-xs max-w-xs">
                    {r.note ? <span className="italic">&ldquo;{r.note}&rdquo;</span> : <span className="opacity-30">—</span>}
                  </td>
                  <td className="px-6 py-4 text-white/40 font-mono text-xs">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleFulfill(r.id, r.userId)}
                        disabled={fulfillingId === r.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600/20 hover:bg-green-600/30 text-green-400 text-xs font-semibold rounded-lg transition-colors disabled:opacity-40"
                      >
                        <Check size={12} />
                        {fulfillingId === r.id ? "Generating..." : "Issue Key"}
                      </button>
                      <button
                        onClick={() => handleReject(r.id)}
                        disabled={rejectingId === r.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/10 hover:bg-red-600/20 text-red-400 text-xs font-semibold rounded-lg transition-colors disabled:opacity-40"
                      >
                        <XCircle size={12} />
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Form */}
      <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-white/70 uppercase tracking-widest mb-4">Generate Runner Key</h2>
        <form onSubmit={handleCreate} className="flex flex-wrap gap-3">
          <select
            value={newUserId}
            onChange={(e) => setNewUserId(e.target.value)}
            className="bg-black/40 border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-purple-500"
          >
            <option value="">Select user...</option>
            {users.map((u: any) => (
              <option key={u.id} value={u.id}>{u.username || u.email || u.id}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Label (optional)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className="bg-black/40 border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-purple-500 w-48"
          />
          <button
            type="submit"
            disabled={creating}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            <Plus size={14} /> {creating ? "Generating..." : "Generate Key"}
          </button>
        </form>
      </div>

      {/* Runners Table */}
      <div className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-white/40 text-xs uppercase tracking-widest font-mono">
              <th className="px-6 py-4 text-left">User</th>
              <th className="px-6 py-4 text-left">Label</th>
              <th className="px-6 py-4 text-left">Public Key</th>
              <th className="px-6 py-4 text-left">Trusted</th>
              <th className="px-6 py-4 text-left">Placements</th>
              <th className="px-6 py-4 text-left">Jobs</th>
              <th className="px-6 py-4 text-left">Status</th>
              <th className="px-6 py-4 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {runners.map((r: any) => (
              <tr key={r.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                <td className="px-6 py-4 text-white/70 font-mono text-xs">{r.user?.username || r.user?.email || r.userId}</td>
                <td className="px-6 py-4 text-white/50 text-xs">{r.label || "—"}</td>
                <td className="px-6 py-4 font-mono text-xs text-white/40">{r.publicKey?.slice(27, 47)}...</td>
                <td className="px-6 py-4">
                  {r.trusted
                    ? <span className="flex items-center gap-1 text-green-400 text-xs font-mono"><CheckCircle size={12} /> Trusted</span>
                    : <span className="flex items-center gap-1 text-amber-400 text-xs font-mono"><XCircle size={12} /> Pending</span>}
                </td>
                <td className="px-6 py-4">
                  {r.canRunPlacements
                    ? <span className="flex items-center gap-1 text-purple-400 text-xs font-mono"><Swords size={12} /> Yes</span>
                    : <span className="text-white/20 text-xs font-mono">—</span>}
                </td>
                <td className="px-6 py-4 text-white/50 font-mono text-xs">{r.jobsProcessed}</td>
                <td className="px-6 py-4">
                  {r.revokedAt
                    ? <span className="text-red-400 text-xs font-mono">Revoked</span>
                    : <span className="text-green-400 text-xs font-mono">Active</span>}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    {!r.revokedAt && (
                      <>
                        <button
                          onClick={() => handleTrust(r.id, !r.trusted)}
                          className="p-1.5 rounded-lg hover:bg-white/5 text-white/40 hover:text-purple-400 transition-colors"
                          title={r.trusted ? "Revoke trust" : "Grant trust"}
                        >
                          {r.trusted ? <ShieldOff size={14} /> : <Shield size={14} />}
                        </button>
                        <button
                          onClick={() => handleTogglePlacements(r.id, r.canRunPlacements)}
                          className={`p-1.5 rounded-lg hover:bg-white/5 transition-colors ${r.canRunPlacements ? "text-purple-400" : "text-white/40 hover:text-purple-400"}`}
                          title={r.canRunPlacements ? "Disable placement matches" : "Enable placement matches"}
                        >
                          <Swords size={14} />
                        </button>
                        <button
                          onClick={() => handleRevoke(r.id)}
                          className="p-1.5 rounded-lg hover:bg-white/5 text-white/40 hover:text-red-400 transition-colors"
                          title="Revoke key"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {runners.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-white/20 font-mono text-xs">No runner keys yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* One-Time Private Key Modal */}
      {oneTimeKey && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0d0d0d] border border-white/10 rounded-2xl p-8 max-w-xl w-full space-y-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <Terminal size={20} className="text-green-400" />
                <div>
                  <h3 className="text-white font-bold text-lg">Runner Private Key</h3>
                  <p className="text-xs text-white/40 font-mono mt-0.5">{oneTimeKey.label}</p>
                </div>
              </div>
              <button onClick={handleCloseModal} className="text-white/30 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
              <p className="text-red-400 text-sm font-semibold">This is the only time this private key will be shown.</p>
              <p className="text-red-300/70 text-xs mt-1">Store it securely before closing. It cannot be recovered.</p>
            </div>

            <div className="relative">
              <pre className="bg-black/60 border border-white/10 rounded-xl p-4 text-green-400 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all">
                {oneTimeKey.privateKey}
              </pre>
              <button
                onClick={() => handleCopy(oneTimeKey.privateKey)}
                className="absolute top-3 right-3 p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-colors"
              >
                {copied ? <CheckCircle size={14} className="text-green-400" /> : <Copy size={14} />}
              </button>
            </div>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="w-4 h-4 accent-purple-500"
              />
              <span className="text-white/70 text-sm">I have copied and securely stored my private key</span>
            </label>

            <button
              onClick={handleCloseModal}
              disabled={!confirmed}
              className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
            >
              Done — Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
