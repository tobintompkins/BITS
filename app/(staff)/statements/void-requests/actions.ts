"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  ControlledStatementVoidError,
  executeApprovedStatementVoid,
} from "@/server/services/controlled-statement-void.service";
import {
  StatementVoidReviewError,
  decideStatementVoidRequest,
} from "@/server/services/statement-void-review.service";

function revalidateStatementSurfaces(input?: {
  statementId?: string;
  donorId?: string | null;
  householdId?: string | null;
}) {
  revalidatePath("/statements/void-requests");
  revalidatePath("/statements/registry");
  revalidatePath("/statements");
  revalidatePath("/portal/statements");
  revalidatePath("/portal");
  if (input?.statementId) {
    revalidatePath(`/statements/registry/${input.statementId}`);
  }
  if (input?.donorId) {
    revalidatePath(`/statements/recipients/${input.donorId}`);
  }
  if (input?.householdId) {
    revalidatePath(`/statements/households/${input.householdId}`);
  }
}

export async function decideStatementVoidRequestAction(
  requestId: string,
  formData: FormData,
) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  let outcome = "reviewed";
  try {
    const result = await decideStatementVoidRequest(requestId, {
      decision: String(formData.get("decision") ?? ""),
      reviewNote: String(formData.get("reviewNote") ?? ""),
    });
    outcome = result.status === "APPROVED" ? "approved" : "rejected";
    revalidatePath(`/statements/registry/${result.statementId}`);
  } catch (error) {
    outcome =
      error instanceof StatementVoidReviewError
        ? `error:${error.message}`
        : "error:The void request could not be reviewed.";
  }

  revalidatePath("/statements/void-requests");
  revalidatePath("/statements/registry");
  redirect(`/statements/void-requests?result=${encodeURIComponent(outcome)}`);
}

export async function executeApprovedStatementVoidAction(
  requestId: string,
  formData: FormData,
) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  let outcome = "executed";
  try {
    const result = await executeApprovedStatementVoid({
      requestId,
      confirmed: formData.get("confirmed") === "true",
    });
    revalidateStatementSurfaces(result);
  } catch (error) {
    if (
      error instanceof ControlledStatementVoidError &&
      error.code === "SIGNED_OUT"
    ) {
      redirect("/sign-in");
    }
    outcome =
      error instanceof ControlledStatementVoidError
        ? `error:${error.message}`
        : "error:The approved void request could not be executed.";
    revalidatePath("/statements/void-requests");
  }

  redirect(`/statements/void-requests?result=${encodeURIComponent(outcome)}`);
}
