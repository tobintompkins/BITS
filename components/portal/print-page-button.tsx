"use client";

type PrintPageButtonProps = {
  label: string;
  ariaLabel: string;
  note?: string;
};

export function PrintPageButton({
  label,
  ariaLabel,
  note,
}: PrintPageButtonProps) {
  return (
    <div className="print-hidden rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
      <button
        type="button"
        onClick={() => window.print()}
        aria-label={ariaLabel}
        className="rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
      >
        {label}
      </button>
      {note ? (
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--bits-muted)]">
          {note}
        </p>
      ) : null}
    </div>
  );
}
