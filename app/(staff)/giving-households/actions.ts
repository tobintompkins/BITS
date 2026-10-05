"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  emptyGivingHousehold,
  givingHouseholdRefreshPaths,
  type GivingHouseholdActionState,
  type GivingHouseholdMembershipMutation,
  type GivingHouseholdPickerState,
} from "@/lib/validation/giving-household";
import {
  GivingHouseholdError,
  endGivingHouseholdMembership,
  givingHouseholdFormFromUnknown,
  linkGivingHouseholdDonor,
  moveGivingHouseholdDonor,
  saveGivingHousehold,
  searchGivingHouseholdMoveTargets,
  searchUnassignedGivingDonors,
} from "@/server/services/giving-household.service";

function revalidateGivingHouseholdMutation(
  result: GivingHouseholdMembershipMutation,
) {
  const paths = givingHouseholdRefreshPaths(result);
  revalidatePath(paths.directory);
  for (const householdPath of paths.households) {
    revalidatePath(householdPath);
  }
  revalidatePath(paths.donor);
}

export async function saveGivingHouseholdAction(
  organizationId: string,
  id: string | null,
  expectedUpdatedAt: string | null,
  _previous: GivingHouseholdActionState,
  form: FormData,
): Promise<GivingHouseholdActionState> {
  const values = givingHouseholdFormFromUnknown(
    Object.fromEntries(
      Object.keys(emptyGivingHousehold).map((key) => [
        key,
        key === "active" ? form.get(key) === "on" : String(form.get(key) ?? ""),
      ]),
    ),
  );
  try {
    const saved = await saveGivingHousehold(
      organizationId,
      id,
      values,
      expectedUpdatedAt,
    );
    revalidatePath("/giving-households");
    revalidatePath(`/giving-households/${saved.id}`);
    return { message: "Giving household saved.", savedId: saved.id, values };
  } catch (error) {
    return {
      message:
        error instanceof GivingHouseholdError
          ? error.message
          : "Unable to save the giving household. Please try again.",
      values,
    };
  }
}

export async function linkGivingHouseholdDonorAction(
  organizationId: string,
  householdId: string,
  _previous: GivingHouseholdActionState,
  form: FormData,
): Promise<GivingHouseholdActionState> {
  try {
    const saved = await linkGivingHouseholdDonor(organizationId, {
      householdId,
      donorId: String(form.get("donorId") ?? ""),
      startDate: String(form.get("startDate") ?? ""),
      relationshipLabel: String(form.get("relationshipLabel") ?? ""),
      confirmBackdate: form.get("confirmBackdate") === "on",
    });
    revalidateGivingHouseholdMutation(saved);
    redirect(`/giving-households/${saved.householdIds[0]}`);
  } catch (error) {
    if (error instanceof GivingHouseholdError) {
      return { message: error.message };
    }
    throw error;
  }
}

export async function moveGivingHouseholdDonorAction(
  organizationId: string,
  _previous: GivingHouseholdActionState,
  form: FormData,
): Promise<GivingHouseholdActionState> {
  try {
    const saved = await moveGivingHouseholdDonor(organizationId, {
      fromHouseholdId: String(form.get("fromHouseholdId") ?? ""),
      toHouseholdId: String(form.get("toHouseholdId") ?? ""),
      currentMembershipId: String(form.get("currentMembershipId") ?? ""),
      effectiveDate: String(form.get("effectiveDate") ?? ""),
      relationshipLabel: String(form.get("relationshipLabel") ?? ""),
      confirmBackdate: form.get("confirmBackdate") === "on",
    });
    revalidateGivingHouseholdMutation(saved);
    redirect(`/giving-households/${saved.householdIds[saved.householdIds.length - 1]}`);
  } catch (error) {
    if (error instanceof GivingHouseholdError) {
      return { message: error.message };
    }
    throw error;
  }
}

export async function endGivingHouseholdMembershipAction(
  organizationId: string,
  _previous: GivingHouseholdActionState,
  form: FormData,
): Promise<GivingHouseholdActionState> {
  try {
    const [membershipId = "", expectedUpdatedAt = ""] = String(
      form.get("membershipToken") ?? "",
    ).split("::");
    const saved = await endGivingHouseholdMembership(organizationId, {
      membershipId,
      endDate: String(form.get("endDate") ?? ""),
      expectedUpdatedAt,
      confirmBackdate: form.get("confirmBackdate") === "on",
    });
    revalidateGivingHouseholdMutation(saved);
    redirect(`/giving-households/${saved.householdIds[0]}`);
  } catch (error) {
    if (error instanceof GivingHouseholdError) {
      return { message: error.message };
    }
    throw error;
  }
}

function pickerFromUnknown(
  rows: Array<{ id: string; label: string }>,
  total: number,
  q: string,
  page: number,
  selectedId: string,
  message = "",
): GivingHouseholdPickerState {
  return { rows, total, q, page, selectedId, message };
}

export async function searchUnassignedGivingDonorsAction(
  organizationId: string,
  _previous: GivingHouseholdPickerState,
  form: FormData,
): Promise<GivingHouseholdPickerState> {
  const q = String(form.get("q") ?? "");
  const selectedId = String(form.get("selectedId") ?? form.get("donorId") ?? "");
  const requestedPage = Number(form.get("page") ?? 1);
  try {
    const result = await searchUnassignedGivingDonors(
      organizationId,
      q,
      requestedPage,
    );
    return pickerFromUnknown(
      result.rows.map((row) => ({
        id: row.id,
        label: `${row.lastName}, ${row.firstName}${row.email ? ` · ${row.email}` : ""}`,
      })),
      result.total,
      result.q,
      result.page,
      selectedId,
    );
  } catch (error) {
    return pickerFromUnknown(
      [],
      0,
      q,
      1,
      selectedId,
      error instanceof GivingHouseholdError
        ? error.message
        : "Unable to search donors.",
    );
  }
}

export async function searchGivingHouseholdMoveTargetsAction(
  organizationId: string,
  excludeHouseholdId: string,
  _previous: GivingHouseholdPickerState,
  form: FormData,
): Promise<GivingHouseholdPickerState> {
  const q = String(form.get("q") ?? "");
  const selectedId = String(
    form.get("selectedId") ?? form.get("toHouseholdId") ?? "",
  );
  const requestedPage = Number(form.get("page") ?? 1);
  try {
    const result = await searchGivingHouseholdMoveTargets(
      organizationId,
      excludeHouseholdId,
      q,
      requestedPage,
    );
    return pickerFromUnknown(
      result.rows.map((row) => ({
        id: row.id,
        label: row.displayName,
      })),
      result.total,
      result.q,
      result.page,
      selectedId,
    );
  } catch (error) {
    return pickerFromUnknown(
      [],
      0,
      q,
      1,
      selectedId,
      error instanceof GivingHouseholdError
        ? error.message
        : "Unable to search giving households.",
    );
  }
}
