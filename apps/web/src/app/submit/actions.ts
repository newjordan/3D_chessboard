"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ApiClient } from "@/lib/apiClient";
import { revalidatePath } from "next/cache";

export async function submitEngine(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    throw new Error("Authentication required");
  }

  try {
    const userId = (session.user as any).id;
    formData.append("ownerUserId", userId);

    const result = await ApiClient.submitEngine(formData);
    
    revalidatePath("/dashboard");
    revalidatePath("/leaderboard");
    
    return result;
  } catch (error: any) {
    console.error("Submission error:", error);
    return { success: false, error: error.message || "An unknown error occurred during submission." };
  }
}
