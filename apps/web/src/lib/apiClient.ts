const isServer = typeof window === "undefined";
const BASE_URL_RAW = isServer
  ? (process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001")
  : (process.env.NEXT_PUBLIC_API_URL || ""); // Use relative path in browser if no URL providedd

// Standardize: No trailing slash
const API_BASE_URL = BASE_URL_RAW.replace(/\/+$/, "");

export class ApiClient {
  private static async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = `${API_BASE_URL}${normalizedPath}`;

    const res = await fetch(url, {
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

  static async getLeaderboard(page: number = 1, limit: number = 25) {
    return this.request<{ engines: any[]; total: number; page: number; limit: number }>(
      `/api/leaderboard?page=${page}&limit=${limit}`
    );
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

  static async getUserProfile(handle: string) {
    return this.request<any>(`/api/users/${handle}`);
  }

  static async getSubmissionStatus(submissionId: string) {
    return this.request<any>(`/api/submissions/${submissionId}`);
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
  
  static async uploadEngineAssets(engineId: string, userId: string, formData: FormData) {
    // Append userId to formData
    formData.append("userId", userId);
    
    const res = await fetch(`${API_BASE_URL}/api/engines/${engineId}/assets`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(error.error || `HTTP error ${res.status}`);
    }

    return res.json();
  }

  static async updateEngineStatus(id: string, status: string, userId: string) {
    return this.request<any>(`/api/engines/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, userId }),
    });
  }

  // --- ADMIN METHODS ---
  private static async adminRequest<T>(path: string, userId: string, options: RequestInit = {}): Promise<T> {
    return this.request<T>(path, {
      ...options,
      headers: {
        ...options.headers,
        "x-user-id": userId,
      },
    });
  }

  static async getAdminStats(userId: string) {
    return this.adminRequest<any>("/api/admin/stats", userId);
  }

  static async getAdminUsers(userId: string) {
    return this.adminRequest<any[]>("/api/admin/users", userId);
  }

  static async updateAdminUser(adminUserId: string, targetUserId: string, data: any): Promise<any> {
    return this.adminRequest(`/api/admin/users/${targetUserId}`, adminUserId, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  static async getAdminEngines(adminUserId: string): Promise<any[]> {
    return this.adminRequest('/api/admin/engines', adminUserId);
  }

  static async updateAdminEngine(adminUserId: string, engineId: string, data: any): Promise<any> {
    return this.adminRequest(`/api/admin/engines/${engineId}`, adminUserId, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  static async setEngineStatus(adminUserId: string, engineId: string, status: string): Promise<any> {
    return this.adminRequest(`/api/admin/engines/${engineId}/status`, adminUserId, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
  }

  static async getAdminMatches(adminUserId: string): Promise<any[]> {
    return this.adminRequest('/api/admin/matches', adminUserId);
  }

  static async getAdminJobs(adminUserId: string): Promise<any[]> {
    return this.adminRequest('/api/admin/jobs', adminUserId);
  }

  static async retryJob(jobId: string, userId: string) {
    return this.adminRequest<any>(`/api/admin/jobs/${jobId}/retry`, userId, {
      method: "POST",
    });
  }

  // --- RUNNER METHODS ---

  static async getMyRunnerKey(userId: string) {
    return this.request<any | null>("/api/runners/me", {
      headers: { "x-user-id": userId },
    });
  }

  static async getAdminRunners(adminUserId: string): Promise<any[]> {
    return this.adminRequest("/api/admin/runners", adminUserId);
  }

  static async createRunnerKey(adminUserId: string, userId: string, label?: string): Promise<any> {
    return this.adminRequest("/api/admin/runners", adminUserId, {
      method: "POST",
      body: JSON.stringify({ userId, label }),
    });
  }

  static async setRunnerTrust(adminUserId: string, keyId: string, trusted: boolean): Promise<any> {
    return this.adminRequest(`/api/admin/runners/${keyId}/trust`, adminUserId, {
      method: "PATCH",
      body: JSON.stringify({ trusted }),
    });
  }

  static async revokeRunnerKey(adminUserId: string, keyId: string): Promise<any> {
    return this.adminRequest(`/api/admin/runners/${keyId}`, adminUserId, {
      method: "DELETE",
    });
  }
}
