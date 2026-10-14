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
