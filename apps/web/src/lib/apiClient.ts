const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

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

  static async getEngine(slug: string) {
    return this.request<any>(`/api/engines/${slug}`);
  }

  static async getMatch(id: string) {
    return this.request<any>(`/api/matches/${id}`);
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
    return this.request<{ success: boolean }>(`/api/engines/${id}`, {
      method: "DELETE",
      body: JSON.stringify({ userId }),
    });
  }
}
