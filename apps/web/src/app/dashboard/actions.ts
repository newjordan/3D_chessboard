"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ApiClient } from "@/lib/apiClient";
import { revalidatePath } from "next/cache";

export async function deleteEngine(engineId: string) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    throw new Error("Authentication required");
  }

  try {
    const userId = (session.user as any).id;
    await ApiClient.deleteEngine(engineId, userId);
    
    revalidatePath("/dashboard");
    return { success: true };
  } catch (error: any) {
    console.error("Delete error:", error);
    return { success: false, error: error.message || "Failed to delete engine" };
  }
}
