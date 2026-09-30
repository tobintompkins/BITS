"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { LEADERSHIP_DOCUMENTS_HREF } from "@/lib/validation/leadership-document";
import {
  archiveLeadershipDocument,
  createLeadershipDocument,
  restoreLeadershipDocument,
} from "@/server/services/leadership-document.service";

function resultUrl(type: "success" | "error", message: string) {
  const params = new URLSearchParams({ [type]: message });
  return `${LEADERSHIP_DOCUMENTS_HREF}?${params.toString()}`;
}

const sharedMessages = {
  SIGNED_OUT: "You must be signed in.",
  NO_ORGANIZATION: "The church organization has not been configured.",
  UNAUTHORIZED: "You do not have permission to manage leadership documents.",
  INVALID: "Check the title, document type, and file.",
  NOT_FOUND: "That leadership document is not available.",
} as const;

function fail(status: string) {
  redirect(
    resultUrl(
      "error",
      sharedMessages[status as keyof typeof sharedMessages] ??
        "Unable to save that leadership document.",
    ),
  );
}

function revalidate() {
  revalidatePath(LEADERSHIP_DOCUMENTS_HREF);
}

export async function createLeadershipDocumentAction(formData: FormData) {
  const uploaded = formData.get("file");
  const result = await createLeadershipDocument({
    title: formData.get("title"),
    description: formData.get("description"),
    documentType: formData.get("documentType"),
    file: uploaded instanceof File ? uploaded : undefined,
  });

  if (result.status === "CREATED") {
    revalidate();
    redirect(resultUrl("success", "Leadership document saved."));
  }

  fail(result.status);
}

export async function archiveLeadershipDocumentAction(formData: FormData) {
  const result = await archiveLeadershipDocument({
    documentId: formData.get("documentId"),
  });

  if (result.status === "ARCHIVED") {
    revalidate();
    redirect(resultUrl("success", "Leadership document archived."));
  }

  fail(result.status);
}

export async function restoreLeadershipDocumentAction(formData: FormData) {
  const result = await restoreLeadershipDocument({
    documentId: formData.get("documentId"),
  });

  if (result.status === "RESTORED") {
    revalidate();
    redirect(resultUrl("success", "Leadership document restored."));
  }

  fail(result.status);
}
