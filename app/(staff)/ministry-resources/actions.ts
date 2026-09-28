"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  archiveMinistryResource,
  createMinistryResource,
  publishMinistryResource,
  restoreMinistryResource,
  unpublishMinistryResource,
  updateMinistryResource,
} from "@/server/services/ministry-resource.service";

function resultUrl(type: "success" | "error", message: string) {
  const params = new URLSearchParams({ [type]: message });
  return `/ministry-resources?${params.toString()}`;
}

const sharedMessages = {
  SIGNED_OUT: "You must be signed in.",
  NO_ORGANIZATION: "The church organization has not been configured.",
  UNAUTHORIZED: "You do not have permission to manage ministry resources.",
  INVALID: "Check the title and use an https:// link only.",
  NOT_FOUND: "That ministry or resource is not available.",
} as const;

export async function createMinistryResourceAction(formData: FormData) {
  const result = await createMinistryResource({
    ministryId: formData.get("ministryId"),
    title: formData.get("title"),
    description: formData.get("description"),
    url: formData.get("url"),
  });

  if (result.status === "CREATED") {
    revalidatePath("/ministry-resources");
    revalidatePath("/portal/resources");
    redirect(resultUrl("success", "Resource saved as a draft."));
  }

  redirect(
    resultUrl(
      "error",
      sharedMessages[result.status as keyof typeof sharedMessages] ??
        "Unable to save that resource.",
    ),
  );
}

export async function updateMinistryResourceAction(formData: FormData) {
  const result = await updateMinistryResource({
    resourceId: formData.get("resourceId"),
    ministryId: formData.get("ministryId"),
    title: formData.get("title"),
    description: formData.get("description"),
    url: formData.get("url"),
  });

  if (result.status === "UPDATED") {
    revalidatePath("/ministry-resources");
    revalidatePath("/portal/resources");
    redirect(resultUrl("success", "Resource updated."));
  }

  redirect(
    resultUrl(
      "error",
      sharedMessages[result.status as keyof typeof sharedMessages] ??
        "Unable to update that resource.",
    ),
  );
}

export async function publishMinistryResourceAction(formData: FormData) {
  const result = await publishMinistryResource({
    resourceId: formData.get("resourceId"),
  });

  if (result.status === "PUBLISHED") {
    revalidatePath("/ministry-resources");
    revalidatePath("/portal/resources");
    redirect(resultUrl("success", "Resource published."));
  }

  redirect(
    resultUrl(
      "error",
      sharedMessages[result.status as keyof typeof sharedMessages] ??
        "Unable to publish that resource.",
    ),
  );
}

export async function unpublishMinistryResourceAction(formData: FormData) {
  const result = await unpublishMinistryResource({
    resourceId: formData.get("resourceId"),
  });

  if (result.status === "UNPUBLISHED") {
    revalidatePath("/ministry-resources");
    revalidatePath("/portal/resources");
    redirect(resultUrl("success", "Resource returned to draft."));
  }

  redirect(
    resultUrl(
      "error",
      sharedMessages[result.status as keyof typeof sharedMessages] ??
        "Unable to unpublish that resource.",
    ),
  );
}

export async function archiveMinistryResourceAction(formData: FormData) {
  const result = await archiveMinistryResource({
    resourceId: formData.get("resourceId"),
  });

  if (result.status === "ARCHIVED") {
    revalidatePath("/ministry-resources");
    revalidatePath("/portal/resources");
    redirect(resultUrl("success", "Resource archived."));
  }

  redirect(
    resultUrl(
      "error",
      sharedMessages[result.status as keyof typeof sharedMessages] ??
        "Unable to archive that resource.",
    ),
  );
}

export async function restoreMinistryResourceAction(formData: FormData) {
  const result = await restoreMinistryResource({
    resourceId: formData.get("resourceId"),
  });

  if (result.status === "RESTORED") {
    revalidatePath("/ministry-resources");
    revalidatePath("/portal/resources");
    redirect(resultUrl("success", "Resource restored."));
  }

  redirect(
    resultUrl(
      "error",
      sharedMessages[result.status as keyof typeof sharedMessages] ??
        "Unable to restore that resource.",
    ),
  );
}
