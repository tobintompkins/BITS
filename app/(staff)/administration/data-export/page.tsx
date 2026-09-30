import { redirect } from "next/navigation";

import { ChurchDataExportPanel } from "@/components/administration/church-data-export-panel";
import {
  CHURCH_DATA_EXPORT_NOTICE,
  CHURCH_DATA_EXPORT_SUBTITLE,
} from "@/lib/validation/church-data-export";
import { getChurchDataExportAccess } from "@/server/services/church-data-export.service";

export default async function ChurchDataExportPage() {
  const access = await getChurchDataExportAccess();

  if (access.status === "SIGNED_OUT") redirect("/sign-in");
  if (access.status === "NO_ORGANIZATION") redirect("/settings/organization");
  if (access.status === "UNAUTHORIZED") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
          Administration
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
          Church Data Export
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          {CHURCH_DATA_EXPORT_SUBTITLE}
        </p>
      </header>

      <aside
        role="note"
        className="rounded-2xl border border-[var(--bits-gold)] bg-white p-4 shadow-sm"
      >
        <p className="text-sm leading-6 text-[var(--bits-navy)]">
          {CHURCH_DATA_EXPORT_NOTICE} This center does not export giving,
          payments, statement PDFs, leadership documents, or Clerk account data.
        </p>
      </aside>

      <ChurchDataExportPanel />
    </div>
  );
}
