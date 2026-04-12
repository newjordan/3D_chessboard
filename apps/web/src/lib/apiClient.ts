const isServer = typeof window === "undefined";
const API_BASE_URL = isServer
  ? (process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001")
  : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001");

export class ApiClient {
  private static async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      next: { revalidate: 0 } // No cache for MVP consistency
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(error.error || `HTTP error ${res.status}`);
    }

    return res.json();
  }

  static async getLeaderboard() {
    return this.request<any[]>("/api/leaderboard");
  }

  static async getMatches(engine?: string) {
    const url = engine ? `/api/matches?engine=${engine}` : "/api/matches";
    return this.request<any[]>(url);
  }

  static async getRandomMatch() {
    return this.request<any>("/api/matches/random");
  }

  static async getEngine(slug: string) {
    return this.request<any>(`/api/engines/${slug}`);
  }

  static async getMatch(id: string) {
    return this.request<any>(`/api/matches/${id}`);
  }

  static async getMatchPgn(id: string) {
    const res = await fetch(`${API_BASE_URL}/api/matches/${id}/pgn`);
    if (!res.ok) throw new Error("Could not fetch PGN");
    return res.text();
  }

  static async getEnginesByOwner(userId: string) {
    return this.request<any[]>(`/api/engines/by-owner/${userId}`);
  }

  static async submitEngine(form: FormData) {
    const res = await fetch(`${API_BASE_URL}/api/engines/submit`, {
      method: "POST",
      body: form, // Fetch handles FormData content type
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(error.error || `HTTP error ${res.status}`);
    }

    return res.json();
  }

  static async deleteEngine(id: string, userId: string) {
    return this.request<{ success: boolean; message: string }>(`/api/engines/${id}?userId=${userId}`, {
      method: "DELETE",
    });
  }
}
