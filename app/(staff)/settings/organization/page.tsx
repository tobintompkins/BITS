import { OrganizationSettingsForm } from "./organization-settings-form";

import { getOrganizationSettingsValues } from "@/server/services/organization-settings.service";

export default async function OrganizationSettingsPage() {
  const initialValues = await getOrganizationSettingsValues();

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Settings
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
          Organization Settings
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-zinc-600">
          Manage the foundational church profile used for future organization
          workflows, statement rendering, and administrative configuration.
        </p>
      </header>

      <OrganizationSettingsForm initialValues={initialValues} />
    </div>
  );
}
