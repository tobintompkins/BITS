"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  IndividualStatementGenerationError,
  generateIndividualContributionStatement,
} from "@/server/services/individual-statement-generation.service";
import {
  IndividualStatementPublishError,
  publishIndividualContributionStatement,
} from "@/server/services/individual-statement-publish.service";

const generateInputSchema = z.object({
  donorId: z.string().uuid(),
  year: z.string().optional(),
  confirmed: z.literal(true),
});

export async function generateIndividualContributionStatementAction(input: {
  donorId: string;
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
          : "Confirm that you want to generate this unpublished statement.",
    };
  }

  let result;
  try {
    result = await generateIndividualContributionStatement({
      donorId: parsed.data.donorId,
      year: parsed.data.year,
    });
  } catch (error) {
    if (error instanceof IndividualStatementGenerationError) {
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
  const href = `/statements/recipients/${parsed.data.donorId}?${params.toString()}`;
  revalidatePath(`/statements/recipients/${parsed.data.donorId}`);
  revalidatePath("/statements/recipients");
  revalidatePath("/statements");
  redirect(href);
}

const publishInputSchema = z.object({
  statementId: z.string().uuid(),
  confirmed: z.literal(true),
});

export async function publishIndividualContributionStatementAction(input: {
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
    result = await publishIndividualContributionStatement({
      statementId: parsed.data.statementId,
    });
  } catch (error) {
    if (error instanceof IndividualStatementPublishError) {
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
  const href = `/statements/recipients/${result.donorId}?${params.toString()}`;
  revalidatePath(`/statements/recipients/${result.donorId}`);
  revalidatePath("/statements/recipients");
  revalidatePath("/statements");
  revalidatePath("/portal/statements");
  redirect(href);
}
