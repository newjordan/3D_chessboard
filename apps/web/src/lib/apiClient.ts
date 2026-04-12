import { trpc } from "./trpc";

export class ApiClient {
  static async getLeaderboard() {
    return trpc.engines.getLeaderboard.query();
  }

  static async getMatches(engine?: string) {
    return trpc.matches.getList.query({ engine });
  }

  static async getRandomMatch() {
    return trpc.matches.getRandom.query();
  }

  static async getEngine(slug: string) {
    return trpc.engines.getBySlug.query(slug);
  }

  static async getMatch(id: string) {
    return trpc.matches.getById.query(id);
  }

  static async getMatchPgn(id: string) {
    return trpc.matches.getPgn.query(id);
  }

  static async getEnginesByOwner(userId: string) {
    return trpc.engines.getByOwner.query(userId);
  }

  // Admin endpoints — now securely routed via tRPC
  static async getAdminStats() {
    return trpc.admin.getStats.query();
  }

  static async getAdminAdvancedStats() {
    return trpc.admin.getAdvancedStats.query();
  }

  static async getAdminUsers() {
    return trpc.admin.getUsers.query();
  }

  static async getAdminJobs() {
    return trpc.admin.getJobs.query();
  }

  static async retryJob(id: string) {
    return trpc.admin.retryJob.mutate(id);
  }

  // Temporary REST logic for file uploads and specific deletions
  static async submitEngine(form: FormData) {
    const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/+$/, "");
    const res = await fetch(`${API_BASE_URL}/api/engines/submit`, {
      method: "POST",
      body: form,
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(error.error || `HTTP error ${res.status}`);
    }

    return res.json();
  }

  static async deleteEngine(id: string, userId: string) {
    const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/+$/, "");
    const res = await fetch(`${API_BASE_URL}/api/engines/${id}?userId=${userId}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(error.error || `HTTP error ${res.status}`);
    }

    return res.json();
  }
}
