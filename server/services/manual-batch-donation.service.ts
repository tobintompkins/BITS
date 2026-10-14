import type { Prisma } from "@/app/generated/prisma/client";
import { OfferingBatchStatus } from "@/app/generated/prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  requireBatchDonationEntryAccess,
  requireBatchViewAccess,
} from "@/lib/auth/giving-permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { lockChurchThenOfferingBatch } from "@/lib/batches/ledger-locks";
import {
  normalizeEmail,
  normalizePhone,
} from "@/lib/members/duplicate-scoring";
import { moneySubtract } from "@/lib/money/decimal";
import { maskEmail, maskPhone } from "@/lib/privacy/contact-mask";
import {
  batchDonorSearchSchema,
  manualBatchDonationWriteSchema,
  toManualBatchDonationFormValues,
  type ManualBatchDonationWriteInput,
  type ManualPaymentMethod,
} from "@/lib/validation/manual-batch-donation";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import {
  countBatchDonations,
  findActiveDonorsForBatchEntry,
  findActiveOfferingTypes,
  findBatchDonations,
  findManualBatchDonationForEdit,
} from "@/server/repositories/manual-batch-donation.repository";
import { findOfferingBatchById } from "@/server/repositories/offering-batch.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export class ManualBatchDonationError extends Error {
  constructor(
    public readonly code:
      | "SIGNED_OUT"
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "NOT_EDITABLE"
      | "INVALID_REQUEST"
      | "INACTIVE_DONOR"
      | "INACTIVE_FUND",
    message: string,
  ) {
    super(message);
    this.name = "ManualBatchDonationError";
  }
}

export const CREATE_MANUAL_BATCH_DONATION = "CREATE_MANUAL_BATCH_DONATION";
export const UPDATE_MANUAL_BATCH_DONATION = "UPDATE_MANUAL_BATCH_DONATION";
export const DELETE_MANUAL_BATCH_DONATION = "DELETE_MANUAL_BATCH_DONATION";

function parseDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateOnlyString(value: Date) {
  return value.toISOString().slice(0, 10);
}

function persistNote(reference: string | null, note: string | null) {
  if (reference && note) return `Reference: ${reference}\n${note}`;
  if (reference) return `Reference: ${reference}`;
  return note;
}

async function requireOrganization() {
  const organization = await findPrimaryOrganization();
  if (!organization) {
    throw new ManualBatchDonationError(
      "NOT_FOUND",
      "Church organization not found.",
    );
  }
  return organization;
}

async function requireActor() {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) {
    throw new ManualBatchDonationError("SIGNED_OUT", "You must be signed in.");
  }
  return userAccount;
}

export async function searchDonorsForBatchDonation(rawQuery: string) {
  await requireActor();
  const organization = await requireOrganization();
  try {
    await requireBatchDonationEntryAccess(organization.id);
  } catch {
    throw new ManualBatchDonationError(
      "FORBIDDEN",
      "You do not have permission to add donations to offering batches.",
    );
  }

  const parsed = batchDonorSearchSchema.safeParse({ q: rawQuery });
  if (!parsed.success) {
    throw new ManualBatchDonationError(
      "INVALID_REQUEST",
      "Enter a donor search.",
    );
  }

  const q = parsed.data.q;
  const digits = normalizePhone(q);
  const email = normalizeEmail(q);
  const parts = q.split(/\s+/).filter(Boolean);
  const filters: Prisma.DonorWhereInput[] = [
    { firstName: { contains: q, mode: "insensitive" } },
    { lastName: { contains: q, mode: "insensitive" } },
    { email: { contains: q, mode: "insensitive" } },
  ];
  if (parts.length >= 2) {
    filters.push({
      AND: [
        { firstName: { contains: parts[0], mode: "insensitive" } },
        { lastName: { contains: parts.slice(1).join(" "), mode: "insensitive" } },
      ],
    });
  }
  if (digits.length >= 4) {
    filters.push({ phone: { contains: digits } });
    filters.push({ phone: { contains: digits.slice(-4) } });
  }

  const donors = await findActiveDonorsForBatchEntry(organization.id, {
    OR: filters,
  });

  return donors.map((donor) => ({
    id: donor.id,
    name: `${donor.firstName} ${donor.lastName}`,
    maskedEmail: maskEmail(donor.email),
    maskedPhone: maskPhone(donor.phone),
    householdName: donor.householdMemberships[0]?.household.displayName ?? null,
    recommended: Boolean(donor.email) && normalizeEmail(donor.email) === email,
  }));
}

export async function getActiveOfferingFundsForBatchEntry() {
  await requireActor();
  const organization = await requireOrganization();
  try {
    await requireBatchDonationEntryAccess(organization.id);
  } catch {
    throw new ManualBatchDonationError(
      "FORBIDDEN",
      "You do not have permission to add donations to offering batches.",
    );
  }
  return findActiveOfferingTypes(organization.id);
}

export async function getOfferingBatchDonations(
  batchId: string,
  query: { page: number; pageSize: number },
) {
  await requireActor();
  const organization = await requireOrganization();
  try {
    await requireBatchViewAccess(organization.id);
  } catch {
    throw new ManualBatchDonationError(
      "FORBIDDEN",
      "You do not have permission to view offering batches.",
    );
  }

  const batch = await findOfferingBatchById(organization.id, batchId);
  if (!batch) {
    throw new ManualBatchDonationError("NOT_FOUND", "Offering batch not found.");
  }

  const [total, rows] = await Promise.all([
    countBatchDonations(organization.id, batchId),
    findBatchDonations(organization.id, batchId, {
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return {
    page: query.page,
    pageSize: query.pageSize,
    total,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    donations: rows.map((donation) => ({
      id: donation.id,
      donorName: donation.anonymous
        ? "Anonymous"
        : donation.donor
          ? `${donation.donor.firstName} ${donation.donor.lastName}`
          : "Unmatched donor",
      offeringDate: donation.offeringDate,
      paymentMethod: donation.paymentMethod,
      totalAmount: donation.totalAmount.toString(),
      deductibleAmount: donation.deductibleAmount.toString(),
      source: donation.stripeCheckoutSessionId ? "stripe" : "manual",
      isTest: donation.isTest,
      allocations: donation.allocations.map((row) => ({
        fund: row.offeringType.name,
        amount: row.amount.toString(),
      })),
    })),
  };
}

export async function createManualBatchDonation(
  batchId: string,
  rawInput: unknown,
) {
  const userAccount = await requireActor();
  const organization = await requireOrganization();
  try {
    await requireBatchDonationEntryAccess(organization.id);
  } catch {
    throw new ManualBatchDonationError(
      "FORBIDDEN",
      "You do not have permission to add donations to offering batches.",
    );
  }

  const parsed = manualBatchDonationWriteSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ManualBatchDonationError(
      "INVALID_REQUEST",
      parsed.error.issues[0]?.message ?? "Check the donation form and try again.",
    );
  }
  const input = parsed.data;

  try {
    return await prisma.$transaction(async (tx) => {
      return applyManualBatchDonationCreate({
        db: tx,
        organizationId: organization.id,
        actorUserAccountId: userAccount.id,
        batchId,
        input,
      });
    });
  } catch (error) {
    if (error instanceof ManualBatchDonationError) throw error;
    throw new ManualBatchDonationError(
      "INVALID_REQUEST",
      "This donation could not be recorded.",
    );
  }
}

async function requireDraftBatchForMutation(
  db: Prisma.TransactionClient,
  organizationId: string,
  batchId: string,
) {
  const locked = await lockChurchThenOfferingBatch(db, organizationId, batchId);
  if (!locked.organization || !locked.batch) {
    throw new ManualBatchDonationError("NOT_FOUND", "Offering batch not found.");
  }

  const batch = await db.offeringBatch.findFirst({
    where: { id: batchId, organizationId },
    select: {
      id: true,
      status: true,
      offeringDate: true,
      recordedTotal: true,
    },
  });
  if (!batch) {
    throw new ManualBatchDonationError("NOT_FOUND", "Offering batch not found.");
  }
  if (batch.status !== OfferingBatchStatus.DRAFT) {
    throw new ManualBatchDonationError(
      "NOT_EDITABLE",
      "Donations can only be changed on draft batches.",
    );
  }
  return batch;
}

async function requireActiveDonorAndFunds(
  db: Prisma.TransactionClient,
  organizationId: string,
  input: ManualBatchDonationWriteInput,
) {
  if (input.donorId) {
    const donor = await db.donor.findFirst({
      where: { id: input.donorId, organizationId },
      select: { id: true, active: true },
    });
    if (!donor) {
      throw new ManualBatchDonationError("NOT_FOUND", "Donor not found.");
    }
    if (!donor.active) {
      throw new ManualBatchDonationError(
        "INACTIVE_DONOR",
        "Choose an active donor.",
      );
    }
  }

  const fundIds = input.allocations.map((row) => row.offeringTypeId);
  const funds = await db.offeringType.findMany({
    where: { id: { in: fundIds }, organizationId },
    select: { id: true, active: true },
  });
  for (const fundId of fundIds) {
    const fund = funds.find((row) => row.id === fundId);
    if (!fund) {
      throw new ManualBatchDonationError("NOT_FOUND", "Giving fund not found.");
    }
    if (!fund.active) {
      throw new ManualBatchDonationError(
        "INACTIVE_FUND",
        "Choose an active giving fund.",
      );
    }
  }
}

function requireOfferingDateConfirmation(
  batchOfferingDate: string,
  input: ManualBatchDonationWriteInput,
) {
  if (
    input.offeringDate !== batchOfferingDate &&
    !input.confirmOfferingDateOverride
  ) {
    throw new ManualBatchDonationError(
      "INVALID_REQUEST",
      "Confirm that this donation should use a different offering date than the batch.",
    );
  }
}

function donationWriteData(
  organizationId: string,
  batchId: string,
  input: ManualBatchDonationWriteInput,
) {
  return {
    organizationId,
    donorId: input.anonymous ? null : input.donorId,
    batchId,
    offeringDate: parseDateOnly(input.offeringDate),
    receivedDate: parseDateOnly(input.receivedDate),
    paymentMethod: input.paymentMethod,
    totalAmount: input.totalAmount,
    checkNumber: input.checkNumber,
    note: persistNote(input.reference, input.note),
    anonymous: input.anonymous,
    isTaxDeductible: input.isTaxDeductible,
    deductibleAmount: input.deductibleAmount,
    goodsOrServicesProvided: input.goodsOrServicesProvided,
    goodsOrServicesDescription: input.goodsOrServicesDescription,
    goodsOrServicesEstimatedValue: input.goodsOrServicesEstimatedValue,
    intangibleReligiousBenefitsOnly: input.intangibleReligiousBenefitsOnly,
    stripeCheckoutSessionId: null,
    stripePaymentIntentId: null,
    isTest: false,
  };
}

function donationAuditChanges(
  input: ManualBatchDonationWriteInput,
  extras: Array<{ field: string; oldValue: string | null; newValue: string | null }>,
) {
  return [
    ...extras,
    {
      field: "paymentMethod",
      oldValue: null,
      newValue: input.paymentMethod,
    },
    {
      field: "anonymous",
      oldValue: null,
      newValue: input.anonymous ? "true" : "false",
    },
    {
      field: "totalAmount",
      oldValue: extras.find((row) => row.field === "totalAmount")?.oldValue ?? null,
      newValue: input.totalAmount,
    },
    {
      field: "deductibleAmount",
      oldValue: null,
      newValue: input.deductibleAmount,
    },
    {
      field: "allocations",
      oldValue: null,
      newValue: JSON.stringify(input.allocations),
    },
  ];
}

export async function applyManualBatchDonationCreate(input: {
  db: Prisma.TransactionClient;
  organizationId: string;
  actorUserAccountId: string;
  batchId: string;
  input: ManualBatchDonationWriteInput;
}) {
  const batch = await requireDraftBatchForMutation(
    input.db,
    input.organizationId,
    input.batchId,
  );
  requireOfferingDateConfirmation(dateOnlyString(batch.offeringDate), input.input);
  await requireActiveDonorAndFunds(input.db, input.organizationId, input.input);

  const donation = await input.db.donation.create({
    data: donationWriteData(input.organizationId, batch.id, input.input),
    select: { id: true, totalAmount: true, donorId: true, anonymous: true },
  });

  await input.db.donationAllocation.createMany({
    data: input.input.allocations.map((row) => ({
      organizationId: input.organizationId,
      donationId: donation.id,
      offeringTypeId: row.offeringTypeId,
      amount: row.amount,
    })),
  });

  const updated = await input.db.offeringBatch.updateMany({
    where: {
      id: batch.id,
      organizationId: input.organizationId,
      status: OfferingBatchStatus.DRAFT,
    },
    data: {
      recordedTotal: { increment: input.input.totalAmount },
    },
  });
  if (updated.count !== 1) {
    throw new ManualBatchDonationError(
      "NOT_EDITABLE",
      "This batch is no longer a draft and cannot accept donations.",
    );
  }

  await createAuditEvent(
    {
      organizationId: input.organizationId,
      actorUserAccountId: input.actorUserAccountId,
      action: CREATE_MANUAL_BATCH_DONATION,
      entityType: "Donation",
      entityId: donation.id,
      changes: donationAuditChanges(input.input, [
        { field: "batchId", oldValue: null, newValue: batch.id },
      ]),
    },
    input.db,
  );

  return {
    id: donation.id,
    batchId: batch.id,
    totalAmount: donation.totalAmount.toString(),
  };
}

export async function getManualBatchDonationForEdit(
  batchId: string,
  donationId: string,
) {
  await requireActor();
  const organization = await requireOrganization();
  try {
    await requireBatchDonationEntryAccess(organization.id);
  } catch {
    throw new ManualBatchDonationError(
      "FORBIDDEN",
      "You do not have permission to add donations to offering batches.",
    );
  }

  const batch = await findOfferingBatchById(organization.id, batchId);
  if (!batch) {
    throw new ManualBatchDonationError("NOT_FOUND", "Offering batch not found.");
  }
  if (batch.status !== OfferingBatchStatus.DRAFT) {
    throw new ManualBatchDonationError(
      "NOT_EDITABLE",
      "Donations can only be changed on draft batches.",
    );
  }

  const donation = await findManualBatchDonationForEdit(
    organization.id,
    batchId,
    donationId,
  );
  if (!donation) {
    throw new ManualBatchDonationError("NOT_FOUND", "Donation not found.");
  }
  if (donation.stripeCheckoutSessionId || donation.stripePaymentIntentId) {
    throw new ManualBatchDonationError(
      "NOT_EDITABLE",
      "Stripe gifts cannot be edited from batch entry.",
    );
  }

  const paymentMethod = donation.paymentMethod as ManualPaymentMethod;
  return {
    batch,
    selectedDonor: donation.donor
      ? {
          id: donation.donor.id,
          name: `${donation.donor.firstName} ${donation.donor.lastName}`,
          maskedEmail: null,
          maskedPhone: null,
          householdName: null,
        }
      : null,
    formValues: toManualBatchDonationFormValues({
      donorId: donation.donorId,
      anonymous: donation.anonymous,
      offeringDate: dateOnlyString(donation.offeringDate),
      receivedDate: dateOnlyString(donation.receivedDate),
      paymentMethod,
      checkNumber: donation.checkNumber,
      note: donation.note,
      isTaxDeductible: donation.isTaxDeductible,
      deductibleAmount: donation.deductibleAmount.toString(),
      goodsOrServicesProvided: donation.goodsOrServicesProvided,
      goodsOrServicesDescription: donation.goodsOrServicesDescription,
      goodsOrServicesEstimatedValue:
        donation.goodsOrServicesEstimatedValue?.toString() ?? null,
      intangibleReligiousBenefitsOnly: donation.intangibleReligiousBenefitsOnly,
      allocations: donation.allocations.map((row) => ({
        offeringTypeId: row.offeringTypeId,
        amount: row.amount.toString(),
      })),
    }),
  };
}

export async function updateManualBatchDonation(
  batchId: string,
  donationId: string,
  rawInput: unknown,
) {
  const userAccount = await requireActor();
  const organization = await requireOrganization();
  try {
    await requireBatchDonationEntryAccess(organization.id);
  } catch {
    throw new ManualBatchDonationError(
      "FORBIDDEN",
      "You do not have permission to add donations to offering batches.",
    );
  }

  const parsed = manualBatchDonationWriteSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ManualBatchDonationError(
      "INVALID_REQUEST",
      parsed.error.issues[0]?.message ?? "Check the donation form and try again.",
    );
  }

  try {
    return await prisma.$transaction(async (tx) => {
      return applyManualBatchDonationUpdate({
        db: tx,
        organizationId: organization.id,
        actorUserAccountId: userAccount.id,
        batchId,
        donationId,
        input: parsed.data,
      });
    });
  } catch (error) {
    if (error instanceof ManualBatchDonationError) throw error;
    throw new ManualBatchDonationError(
      "INVALID_REQUEST",
      "This donation could not be updated.",
    );
  }
}

export async function applyManualBatchDonationUpdate(input: {
  db: Prisma.TransactionClient;
  organizationId: string;
  actorUserAccountId: string;
  batchId: string;
  donationId: string;
  input: ManualBatchDonationWriteInput;
}) {
  const batch = await requireDraftBatchForMutation(
    input.db,
    input.organizationId,
    input.batchId,
  );
  requireOfferingDateConfirmation(dateOnlyString(batch.offeringDate), input.input);
  await requireActiveDonorAndFunds(input.db, input.organizationId, input.input);

  const existing = await input.db.donation.findFirst({
    where: {
      id: input.donationId,
      organizationId: input.organizationId,
      batchId: batch.id,
    },
    select: {
      id: true,
      totalAmount: true,
      stripeCheckoutSessionId: true,
      stripePaymentIntentId: true,
    },
  });
  if (!existing) {
    throw new ManualBatchDonationError("NOT_FOUND", "Donation not found.");
  }
  if (existing.stripeCheckoutSessionId || existing.stripePaymentIntentId) {
    throw new ManualBatchDonationError(
      "NOT_EDITABLE",
      "Stripe gifts cannot be edited from batch entry.",
    );
  }

  const previousTotal = existing.totalAmount.toString();
  const delta = moneySubtract(input.input.totalAmount, previousTotal);

  await input.db.donation.update({
    where: { id: existing.id },
    data: donationWriteData(input.organizationId, batch.id, input.input),
  });
  await input.db.donationAllocation.deleteMany({
    where: {
      organizationId: input.organizationId,
      donationId: existing.id,
    },
  });
  await input.db.donationAllocation.createMany({
    data: input.input.allocations.map((row) => ({
      organizationId: input.organizationId,
      donationId: existing.id,
      offeringTypeId: row.offeringTypeId,
      amount: row.amount,
    })),
  });

  const updated = await input.db.offeringBatch.updateMany({
    where: {
      id: batch.id,
      organizationId: input.organizationId,
      status: OfferingBatchStatus.DRAFT,
    },
    data: {
      recordedTotal: { increment: delta },
    },
  });
  if (updated.count !== 1) {
    throw new ManualBatchDonationError(
      "NOT_EDITABLE",
      "This batch is no longer a draft and cannot accept donations.",
    );
  }

  await createAuditEvent(
    {
      organizationId: input.organizationId,
      actorUserAccountId: input.actorUserAccountId,
      action: UPDATE_MANUAL_BATCH_DONATION,
      entityType: "Donation",
      entityId: existing.id,
      changes: donationAuditChanges(input.input, [
        { field: "batchId", oldValue: batch.id, newValue: batch.id },
        {
          field: "totalAmount",
          oldValue: previousTotal,
          newValue: input.input.totalAmount,
        },
      ]),
    },
    input.db,
  );

  return {
    id: existing.id,
    batchId: batch.id,
    totalAmount: input.input.totalAmount,
  };
}

export async function deleteManualBatchDonation(
  batchId: string,
  donationId: string,
) {
  const userAccount = await requireActor();
  const organization = await requireOrganization();
  try {
    await requireBatchDonationEntryAccess(organization.id);
  } catch {
    throw new ManualBatchDonationError(
      "FORBIDDEN",
      "You do not have permission to add donations to offering batches.",
    );
  }

  try {
    return await prisma.$transaction(async (tx) => {
      return applyManualBatchDonationDelete({
        db: tx,
        organizationId: organization.id,
        actorUserAccountId: userAccount.id,
        batchId,
        donationId,
      });
    });
  } catch (error) {
    if (error instanceof ManualBatchDonationError) throw error;
    throw new ManualBatchDonationError(
      "INVALID_REQUEST",
      "This donation could not be deleted.",
    );
  }
}

export async function applyManualBatchDonationDelete(input: {
  db: Prisma.TransactionClient;
  organizationId: string;
  actorUserAccountId: string;
  batchId: string;
  donationId: string;
}) {
  const batch = await requireDraftBatchForMutation(
    input.db,
    input.organizationId,
    input.batchId,
  );

  const existing = await input.db.donation.findFirst({
    where: {
      id: input.donationId,
      organizationId: input.organizationId,
      batchId: batch.id,
    },
    select: {
      id: true,
      totalAmount: true,
      stripeCheckoutSessionId: true,
      stripePaymentIntentId: true,
    },
  });
  if (!existing) {
    throw new ManualBatchDonationError("NOT_FOUND", "Donation not found.");
  }
  if (existing.stripeCheckoutSessionId || existing.stripePaymentIntentId) {
    throw new ManualBatchDonationError(
      "NOT_EDITABLE",
      "Stripe gifts cannot be deleted from batch entry.",
    );
  }

  const previousTotal = existing.totalAmount.toString();
  await input.db.donationAllocation.deleteMany({
    where: {
      organizationId: input.organizationId,
      donationId: existing.id,
    },
  });
  await input.db.donation.delete({
    where: { id: existing.id },
  });

  const updated = await input.db.offeringBatch.updateMany({
    where: {
      id: batch.id,
      organizationId: input.organizationId,
      status: OfferingBatchStatus.DRAFT,
    },
    data: {
      recordedTotal: { increment: moneySubtract("0.00", previousTotal) },
    },
  });
  if (updated.count !== 1) {
    throw new ManualBatchDonationError(
      "NOT_EDITABLE",
      "This batch is no longer a draft and cannot accept donations.",
    );
  }

  await createAuditEvent(
    {
      organizationId: input.organizationId,
      actorUserAccountId: input.actorUserAccountId,
      action: DELETE_MANUAL_BATCH_DONATION,
      entityType: "Donation",
      entityId: existing.id,
      changes: [
        { field: "batchId", oldValue: batch.id, newValue: null },
        { field: "totalAmount", oldValue: previousTotal, newValue: null },
      ],
    },
    input.db,
  );

  return { id: existing.id, batchId: batch.id };
}
