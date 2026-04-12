"use server";

import { ApiClient } from "@/lib/apiClient";

export async function getMatchPgnAction(matchId: string) {
  try {
    const pgn = await ApiClient.getMatchPgn(matchId);
    return { success: true, pgn };
  } catch (error: any) {
    console.error("Match PGN fetch action error:", error);
    return { success: false, error: error.message || "Failed to fetch match PGN" };
  }
}
