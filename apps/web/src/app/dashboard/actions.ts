"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ApiClient } from "@/lib/apiClient";
import { revalidatePath } from "next/cache";

export async function deleteEngine(engineId: string) {
  return { success: false, error: "Agent deletion is disabled." };
}
