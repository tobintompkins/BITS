export type ChildSafetyPickupAccess = {
  canViewMembers: boolean;
  canEditMembers: boolean;
  canManageCheckIn: boolean;
};

/** Combined staff policy for approved pickup lists and verified child check-out. */
export function canAccessChildSafetyPickupWorkflow(
  access: ChildSafetyPickupAccess,
) {
  return (
    access.canViewMembers && access.canEditMembers && access.canManageCheckIn
  );
}
