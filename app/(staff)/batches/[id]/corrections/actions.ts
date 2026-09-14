"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  cancelFinancialCorrection,
  createFinancialCorrection,
  decideFinancialCorrection,
} from "@/server/services/financial-correction.service";

export async function createCorrectionAction(batchId: string, formData: FormData) {
  let outcome = "requested";
  try {
    await createFinancialCorrection(batchId, {
      type: String(formData.get("type") ?? "OTHER"),
      reason: String(formData.get("reason") ?? ""),
      requestedChange: String(formData.get("requestedChange") ?? ""),
    });
  } catch (error) {
    outcome = `error:${error instanceof Error ? error.message : "Unable to create request."}`;
  }
  revalidatePath(`/batches/${batchId}/corrections`);
  redirect(`/batches/${batchId}/corrections?result=${encodeURIComponent(outcome)}`);
}

export async function decideCorrectionAction(batchId: string, requestId: string, formData: FormData) {
  let outcome = "reviewed";
  try {
    await decideFinancialCorrection(requestId, {
      decision: String(formData.get("decision") ?? ""),
      reviewNote: String(formData.get("reviewNote") ?? ""),
    });
  } catch (error) {
    outcome = `error:${error instanceof Error ? error.message : "Unable to review request."}`;
  }
  revalidatePath(`/batches/${batchId}/corrections`);
  redirect(`/batches/${batchId}/corrections?result=${encodeURIComponent(outcome)}`);
}

export async function cancelCorrectionAction(batchId: string, requestId: string) {
  let outcome = "cancelled";
  try {
    await cancelFinancialCorrection(requestId);
  } catch (error) {
    outcome = `error:${error instanceof Error ? error.message : "Unable to cancel request."}`;
  }
  revalidatePath(`/batches/${batchId}/corrections`);
  revalidatePath("/batches/corrections");
  redirect(`/batches/${batchId}/corrections?result=${encodeURIComponent(outcome)}`);
}
