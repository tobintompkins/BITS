"use client";

export function PrintStatementPreviewButton() {
  return (
    <div className="print-hidden rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
      <button
        type="button"
        onClick={() => window.print()}
        aria-label="Open the browser print dialog to print or save this statement preview"
        className="rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
      >
        Print or Save Preview
      </button>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--bits-muted)]">
        Saving or printing this page through the browser does not publish an
        official statement.
      </p>
    </div>
  );
}
