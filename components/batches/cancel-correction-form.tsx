"use client";

export function CancelCorrectionForm({
  action,
}: {
  action: () => Promise<void>;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (
          !window.confirm(
            "Cancel this pending correction request? Locked financial records will not change.",
          )
        ) {
          event.preventDefault();
        }
      }}
      className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4"
    >
      <p className="text-sm text-amber-950">
        Cancellation withdraws this pending request. It does not change the
        locked financial records.
      </p>
      <button
        type="submit"
        className="mt-3 rounded-lg border border-amber-800 bg-white px-4 py-2 text-sm font-semibold text-amber-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
      >
        Cancel request
      </button>
    </form>
  );
}
