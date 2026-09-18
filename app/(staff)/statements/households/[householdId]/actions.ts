"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  HouseholdStatementGenerationError,
  generateHouseholdContributionStatement,
} from "@/server/services/household-statement-generation.service";
import {
  HouseholdStatementPublishError,
  publishHouseholdContributionStatement,
} from "@/server/services/household-statement-publish.service";

const generateInputSchema = z.object({
  householdId: z.string().uuid(),
  year: z.string().optional(),
  confirmed: z.literal(true),
});

export async function generateHouseholdContributionStatementAction(input: {
  householdId: string;
  year: string;
  confirmed: boolean;
}) {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false as const, error: "You must be signed in." };
  }

  const parsed = generateInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error:
        input.confirmed === true
          ? "This statement cannot be generated."
          : "Confirm that you want to generate this unpublished household statement.",
    };
  }

  let result;
  try {
    result = await generateHouseholdContributionStatement({
      householdId: parsed.data.householdId,
      year: parsed.data.year,
    });
  } catch (error) {
    if (error instanceof HouseholdStatementGenerationError) {
      return {
        ok: false as const,
        error: error.message,
        code: error.code,
      };
    }
    return {
      ok: false as const,
      error: "The statement could not be generated.",
    };
  }

  const params = new URLSearchParams();
  params.set("year", String(result.year));
  params.set("generated", result.statementIdentifier);
  if (result.einMissing) params.set("einWarning", "1");
  const href = `/statements/households/${parsed.data.householdId}?${params.toString()}`;
  revalidatePath(`/statements/households/${parsed.data.householdId}`);
  revalidatePath("/statements");
  revalidatePath("/statements/registry");
  revalidatePath(`/statements/registry/${result.statementId}`);
  revalidatePath("/portal/statements");
  redirect(href);
}

const publishInputSchema = z.object({
  statementId: z.string().uuid(),
  confirmed: z.literal(true),
});

export async function publishHouseholdContributionStatementAction(input: {
  statementId: string;
  confirmed: boolean;
}) {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false as const, error: "You must be signed in." };
  }

  const parsed = publishInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error:
        input.confirmed === true
          ? "This statement cannot be published."
          : "Confirm that you have reviewed the generated PDF and want to publish.",
    };
  }

  let result;
  try {
    result = await publishHouseholdContributionStatement({
      statementId: parsed.data.statementId,
    });
  } catch (error) {
    if (error instanceof HouseholdStatementPublishError) {
      return {
        ok: false as const,
        error: error.message,
        code: error.code,
      };
    }
    return {
      ok: false as const,
      error: "The statement could not be published.",
    };
  }

  const params = new URLSearchParams();
  if (result.taxYear != null) params.set("year", String(result.taxYear));
  params.set("published", result.statementIdentifier);
  const href = `/statements/households/${result.householdId}?${params.toString()}`;
  revalidatePath(`/statements/households/${result.householdId}`);
  revalidatePath("/statements");
  revalidatePath("/portal/statements");
  redirect(href);
}
