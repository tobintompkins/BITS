"use client";

export function Toast({
  message,
  onDismiss,
  variant = "success",
}: {
  message: string;
  onDismiss: () => void;
  variant?: "success" | "error";
}) {
  const styles =
    variant === "error"
      ? "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100"
      : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100";

  return (
    <div
      role="status"
      className={`fixed right-4 top-4 z-50 max-w-sm rounded-lg border px-4 py-3 text-sm font-medium shadow-lg ${styles}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span>{message}</span>
        <button
          type="button"
          onClick={onDismiss}
          className="opacity-70 hover:opacity-100"
        >
          ×
        </button>
      </div>
    </div>
  );
}
