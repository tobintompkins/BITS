"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import {
  StatementVoidRequestError,
  createStatementVoidRequest,
} from "@/server/services/statement-void-request.service";

export async function requestStatementVoidAction(input: {
  statementId: string;
  reason: string;
}) {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false as const, error: "You must be signed in." };
  }

  try {
    await createStatementVoidRequest({
      statementId: input.statementId,
      reason: input.reason,
    });
  } catch (error) {
    if (error instanceof StatementVoidRequestError) {
      return { ok: false as const, error: error.message, code: error.code };
    }
    return {
      ok: false as const,
      error: "The void request could not be submitted.",
    };
  }

  revalidatePath(`/statements/registry/${input.statementId}`);
  revalidatePath("/statements/registry");
  return { ok: true as const };
}
