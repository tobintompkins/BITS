export function originalV1OwnedAuditEventWhere(
  orgIds: string[],
  ownedEntityIds: string[],
) {
  if (!orgIds.length || !ownedEntityIds.length) {
    return null;
  }
  return {
    organizationId: { in: orgIds },
    entityId: { in: ownedEntityIds },
  };
}

export function originalV1OwnedAuditIdsWhere(
  orgIds: string[],
  auditIds: string[],
) {
  if (!orgIds.length || !auditIds.length) {
    return null;
  }
  return {
    organizationId: { in: orgIds },
    id: { in: auditIds },
  };
}
