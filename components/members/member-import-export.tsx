"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  downloadMemberCsvTemplateAction,
  exportMembersToCsvAction,
  importMembersFromCsvAction,
  previewMembersImportAction,
} from "@/app/(staff)/members/actions";
import { Toast } from "@/components/ui/toast";
import type { MemberImportPreview } from "@/lib/validation/member-import";

export function MemberImportForm() {
  const router = useRouter();
  const [csvContent, setCsvContent] = useState("");
  const [preview, setPreview] = useState<MemberImportPreview | null>(null);
  const [summary, setSummary] = useState<{
    totalRows: number;
    importedRows: number;
    skippedRows: number;
    errorRows: number;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result ?? "");
      setCsvContent(content);
      setPreview(null);
      setSummary(null);
      setError(null);
    };
    reader.readAsText(file);
  }

  function downloadTemplate() {
    startTransition(async () => {
      try {
        const template = await downloadMemberCsvTemplateAction();
        const blob = new Blob([template], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "member-import-template.csv";
        link.click();
        URL.revokeObjectURL(url);
      } catch (templateError) {
        setError(
          templateError instanceof Error
            ? templateError.message
            : "Unable to download template.",
        );
      }
    });
  }

  function runPreview() {
    if (!csvContent.trim()) {
      setError("Upload a CSV file first.");
      return;
    }

    startTransition(async () => {
      try {
        setError(null);
        const result = await previewMembersImportAction(csvContent);
        setPreview(result);
      } catch (previewError) {
        setError(
          previewError instanceof Error
            ? previewError.message
            : "Unable to preview import.",
        );
      }
    });
  }

  function runImport() {
    if (!csvContent.trim()) {
      setError("Upload a CSV file first.");
      return;
    }

    startTransition(async () => {
      try {
        setError(null);
        const result = await importMembersFromCsvAction(csvContent);
        setSummary(result);
        setToast(`Imported ${result.importedRows} members.`);
        router.refresh();
      } catch (importError) {
        setError(
          importError instanceof Error
            ? importError.message
            : "Unable to import members.",
        );
      }
    });
  }

  return (
    <div className="space-y-6">
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={downloadTemplate}
          disabled={isPending}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
        >
          Download CSV template
        </button>
        <Link
          href="/members"
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
        >
          Back to Members
        </Link>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <label className="block text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            Upload CSV
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={isPending}
            onChange={handleFileChange}
            className="mt-2 block w-full text-sm"
          />
        </label>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={runPreview}
            disabled={isPending || !csvContent}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            {isPending ? "Working..." : "Preview import"}
          </button>
          <button
            type="button"
            onClick={runImport}
            disabled={isPending || !csvContent}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
          >
            Import valid rows
          </button>
        </div>
      </section>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {preview ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Import Preview
          </h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <dt className="text-xs uppercase text-zinc-500">Total rows</dt>
              <dd className="text-lg font-semibold">{preview.totalRows}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-zinc-500">Valid rows</dt>
              <dd className="text-lg font-semibold text-emerald-700">
                {preview.validRows.length}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-zinc-500">Possible duplicates</dt>
              <dd className="text-lg font-semibold text-amber-700">
                {preview.possibleDuplicateRows?.length ?? 0}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-zinc-500">Skipped rows</dt>
              <dd className="text-lg font-semibold text-amber-700">
                {preview.skipRows.length}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-zinc-500">Error rows</dt>
              <dd className="text-lg font-semibold text-red-700">
                {preview.errorRows.length}
              </dd>
            </div>
          </dl>

          {preview.errorRows.length > 0 ? (
            <div className="mt-6">
              <h3 className="text-sm font-semibold">Validation errors</h3>
              <ul className="mt-2 space-y-2 text-sm text-red-700 dark:text-red-300">
                {preview.errorRows.map((row) => (
                  <li key={row.rowNumber}>
                    Row {row.rowNumber}: {row.errors.join(" ")}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {preview.possibleDuplicateRows &&
          preview.possibleDuplicateRows.length > 0 ? (
            <div className="mt-6">
              <h3 className="text-sm font-semibold">Possible duplicates (flagged)</h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                These rows remain importable but scored as possible matches.
                Review carefully or skip them.
              </p>
              <ul className="mt-2 space-y-2 text-sm text-amber-800 dark:text-amber-200">
                {preview.possibleDuplicateRows.map((row) => (
                  <li key={`dup-${row.rowNumber}`}>
                    Row {row.rowNumber}: {row.errors.join(" ")}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {preview.skipRows.length > 0 ? (
            <div className="mt-6">
              <h3 className="text-sm font-semibold">Skipped rows</h3>
              <ul className="mt-2 space-y-2 text-sm text-amber-700 dark:text-amber-300">
                {preview.skipRows.map((row) => (
                  <li key={row.rowNumber}>
                    Row {row.rowNumber}: {row.errors.join(" ")}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {summary ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-900 dark:bg-emerald-950">
          <h2 className="text-base font-semibold text-emerald-900 dark:text-emerald-100">
            Import Summary
          </h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-4">
            <div>
              <dt className="text-xs uppercase">Total rows</dt>
              <dd className="text-lg font-semibold">{summary.totalRows}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase">Imported</dt>
              <dd className="text-lg font-semibold">{summary.importedRows}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase">Skipped</dt>
              <dd className="text-lg font-semibold">{summary.skippedRows}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase">Errors</dt>
              <dd className="text-lg font-semibold">{summary.errorRows}</dd>
            </div>
          </dl>
        </section>
      ) : null}
    </div>
  );
}

export function MemberExportButton({
  search,
  status,
  householdId,
}: {
  search: string;
  status: string;
  householdId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleExport() {
    startTransition(async () => {
      try {
        setError(null);
        const csv = await exportMembersToCsvAction({ search, status, householdId });
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "members-export.csv";
        link.click();
        URL.revokeObjectURL(url);
      } catch (exportError) {
        setError(
          exportError instanceof Error
            ? exportError.message
            : "Unable to export members.",
        );
      }
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleExport}
        disabled={isPending}
        className="inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      >
        {isPending ? "Exporting..." : "Export CSV"}
      </button>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
