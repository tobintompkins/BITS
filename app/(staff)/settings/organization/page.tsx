import { OrganizationSettingsForm } from "./organization-settings-form";
import { OrganizationAuditLog } from "./organization-audit-log";

import { getOrganizationAccess } from "@/lib/auth/permissions";
import {
  getOrganizationSettingsAuditLog,
  getOrganizationSettingsValues,
} from "@/server/services/organization-settings.service";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

function formatRoleLabel(roleCode: string | null, isSuperAdmin: boolean) {
  if (isSuperAdmin) {
    return "Super Admin";
  }

  switch (roleCode) {
    case "ORG_ADMIN":
      return "Organization Admin";
    case "TREASURER":
      return "Treasurer";
    case "DATA_ENTRY":
      return "Data Entry";
    case "REPORT_VIEWER":
      return "Report Viewer";
    case "DONOR":
      return "Donor";
    default:
      return null;
  }
}

export default async function OrganizationSettingsPage() {
  const organization = await findPrimaryOrganization();
  const [initialValues, access, auditEvents] = await Promise.all([
    getOrganizationSettingsValues(),
    getOrganizationAccess(organization?.id),
    getOrganizationSettingsAuditLog(),
  ]);

  const roleLabel = formatRoleLabel(access.roleCode, access.isSuperAdmin);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Settings
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-100">
          Organization Settings
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          Manage the foundational church profile used for future organization
          workflows, statement rendering, and administrative configuration.
        </p>
        {roleLabel ? (
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Access level: {roleLabel}
          </p>
        ) : null}
      </header>

      <OrganizationSettingsForm
        initialValues={initialValues}
        canEdit={access.canEdit}
        isReadOnly={access.isReadOnly}
        roleLabel={roleLabel}
      />

      <OrganizationAuditLog events={auditEvents} />
    </div>
  );
}
