import { auth } from "@clerk/nextjs/server";
import { RoleCode } from "@/app/generated/prisma/client";
import {
  canManageOfferingTypes,
  canViewOfferingTypes,
} from "@/lib/auth/offering-type-permissions";
import { prisma } from "@/lib/db/prisma";
import {
  OFFERING_TYPE_PAGE_SIZE,
  offeringTypeSchema,
  type OfferingTypeFormValues,
} from "@/lib/validation/offering-type";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import {
  countOfferingTypeAllocations,
  findOfferingTypeInOrganization,
  listOfferingTypes,
} from "@/server/repositories/offering-type.repository";

export class OfferingTypeError extends Error {}

function isUniqueConstraintError(error: unknown) {
  return (error as { code?: string }).code === "P2002";
}

export async function requireOfferingTypeAccess(
  write = false,
  expectedOrganizationId?: string,
) {
  const { userId, orgId } = await auth();
  if (!userId) throw new OfferingTypeError("Sign in to access offering types.");
  const actor = await prisma.userAccount.findUnique({
    where: { clerkUserId: userId },
  });
  if (!actor?.active) {
    throw new OfferingTypeError("An active staff account is required.");
  }
  const memberships = await prisma.organizationMembership.findMany({
    where: {
      userAccountId: actor.id,
      active: true,
      organization: {
        active: true,
        ...(orgId ? { clerkOrganizationId: orgId } : {}),
      },
    },
    include: { roleType: true, organization: true },
    take: 2,
  });
  if (memberships.length !== 1) {
    throw new OfferingTypeError(
      "Select a church organization with an active staff membership.",
    );
  }
  const membership = memberships[0];
  const roleCode = membership.roleType.code as RoleCode;
  if (write ? !canManageOfferingTypes(roleCode) : !canViewOfferingTypes(roleCode)) {
    throw new OfferingTypeError(
      "You do not have permission to perform this offering type action.",
    );
  }
  if (
    expectedOrganizationId &&
    expectedOrganizationId !== membership.organizationId
  ) {
    throw new OfferingTypeError(
      "Your church selection changed. Reload this page before saving.",
    );
  }
  return {
    actor,
    organization: membership.organization,
    canEdit: canManageOfferingTypes(roleCode),
  };
}

function booleanFromForm(value: unknown) {
  return value === true || value === "on" || value === "true";
}

export function offeringTypeFormFromUnknown(raw: unknown): OfferingTypeFormValues {
  const data = (raw ?? {}) as Record<string, unknown>;
  return {
    name: String(data.name ?? ""),
    description: String(data.description ?? ""),
    code: String(data.code ?? ""),
    defaultTaxDeductible: booleanFromForm(data.defaultTaxDeductible),
    onlineGivingEnabled: booleanFromForm(data.onlineGivingEnabled),
    displayOrder: String(data.displayOrder ?? "0"),
    active: booleanFromForm(data.active),
  };
}

function auditChanges(
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
) {
  const keys = [
    "name",
    "description",
    "code",
    "defaultTaxDeductible",
    "onlineGivingEnabled",
    "displayOrder",
    "active",
  ] as const;
  return keys
    .filter(
      (field) =>
        !before || String(before[field] ?? "") !== String(after[field] ?? ""),
    )
    .map((field) => ({
      field,
      oldValue: before
        ? field === "description"
          ? before[field]
            ? "changed"
            : ""
          : String(before[field] ?? "")
        : null,
      newValue:
        field === "description"
          ? after[field]
            ? "changed"
            : ""
          : String(after[field] ?? ""),
    }));
}

export async function listOfferingTypeDirectory(
  query: string,
  status: string,
  requestedPage: number,
) {
  const access = await requireOfferingTypeAccess();
  const q = query.trim().slice(0, 100);
  const page = Number.isSafeInteger(requestedPage)
    ? Math.max(1, Math.min(100000, requestedPage))
    : 1;
  const { rows, total } = await listOfferingTypes({
    organizationId: access.organization.id,
    query: q,
    status,
    skip: (page - 1) * OFFERING_TYPE_PAGE_SIZE,
    take: OFFERING_TYPE_PAGE_SIZE,
  });
  return { ...access, rows, total, page, q };
}

export async function getOfferingType(id: string) {
  const access = await requireOfferingTypeAccess();
  const offeringType = await findOfferingTypeInOrganization(
    access.organization.id,
    id,
  );
  if (!offeringType) {
    throw new OfferingTypeError("Offering type not found in this church.");
  }
  const allocationCount = await countOfferingTypeAllocations(
    access.organization.id,
    offeringType.id,
  );
  return { ...access, offeringType, allocationCount };
}

export async function saveOfferingType(
  organizationId: string,
  id: string | null,
  raw: unknown,
  expectedUpdatedAt?: string | null,
) {
  const { actor, organization } = await requireOfferingTypeAccess(
    true,
    organizationId,
  );
  const parsed = offeringTypeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new OfferingTypeError(
      parsed.error.issues[0]?.message ?? "Check offering type details.",
    );
  }
  const data = parsed.data;

  try {
    return await prisma.$transaction(async (tx) => {
      const before = id
        ? await findOfferingTypeInOrganization(organization.id, id, tx)
        : null;
      if (id && !before) {
        throw new OfferingTypeError("Offering type not found in this church.");
      }
      if (
        before &&
        before.updatedAt.toISOString() !== expectedUpdatedAt
      ) {
        throw new OfferingTypeError(
          "This fund was updated by someone else. Reload the page before saving.",
        );
      }

      const code =
        before?.code && before.code.trim()
          ? before.code
          : data.code;

      const persist = {
        name: data.name,
        description: data.description,
        code,
        defaultTaxDeductible: data.defaultTaxDeductible,
        onlineGivingEnabled: data.onlineGivingEnabled,
        displayOrder: data.displayOrder,
        active: data.active,
      };

      const offeringType = before
        ? await (async () => {
            const updated = await tx.offeringType.updateMany({
              where: { id: before.id, organizationId: organization.id, updatedAt: before.updatedAt },
              data: { ...persist, updatedAt: new Date(Math.max(Date.now(), before.updatedAt.getTime() + 1)) },
            });
            if (updated.count !== 1) {
              throw new OfferingTypeError(
                "This fund was updated by someone else. Reload the page before saving.",
              );
            }
            return { id: before.id, organizationId: organization.id };
          })()
        : await tx.offeringType.create({
            data: { ...persist, organizationId: organization.id },
          });

      if (offeringType.organizationId !== organization.id) {
        throw new OfferingTypeError("Offering type not found in this church.");
      }

      await createAuditEvent(
        {
          organizationId: organization.id,
          actorUserAccountId: actor.id,
          action: before
            ? data.active !== before.active
              ? data.active
                ? "OFFERING_TYPE_REACTIVATED"
                : "OFFERING_TYPE_DEACTIVATED"
              : "OFFERING_TYPE_UPDATED"
            : "OFFERING_TYPE_CREATED",
          entityType: "OfferingType",
          entityId: offeringType.id,
          changes: auditChanges(before, persist),
        },
        tx,
      );

      return { id: offeringType.id };
    });
  } catch (error) {
    if (error instanceof OfferingTypeError) throw error;
    if (isUniqueConstraintError(error)) {
      throw new OfferingTypeError(
        "That fund code is already used in this church.",
      );
    }
    throw error;
  }
}

export async function setOfferingTypeActive(
  organizationId: string,
  id: string,
  active: boolean,
  expectedUpdatedAt: string,
) {
  const access = await requireOfferingTypeAccess(true, organizationId);
  const current = await findOfferingTypeInOrganization(
    access.organization.id,
    id,
  );
  if (!current) {
    throw new OfferingTypeError("Offering type not found in this church.");
  }
  return saveOfferingType(
    organizationId,
    id,
    {
      name: current.name,
      description: current.description ?? "",
      code: current.code ?? "",
      defaultTaxDeductible: current.defaultTaxDeductible,
      onlineGivingEnabled: current.onlineGivingEnabled,
      displayOrder: current.displayOrder,
      active,
    },
    expectedUpdatedAt,
  );
}
