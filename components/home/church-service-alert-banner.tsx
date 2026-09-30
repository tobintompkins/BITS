import type { ChurchServiceAlertPublicView } from "@/lib/validation/church-service-alert";

export function ChurchServiceAlertBanner({
  alert,
}: {
  alert: ChurchServiceAlertPublicView;
}) {
  return (
    <section
      role="status"
      aria-label="Service alert"
      className="border-b border-[var(--bits-gold)] bg-[var(--bits-navy)] text-white"
    >
      <div className="mx-auto flex w-full max-w-7xl gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <span
          aria-hidden="true"
          className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[var(--bits-gold)] text-sm font-bold text-[var(--bits-gold)]"
        >
          !
        </span>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--bits-gold)]">
            Service Alert · {alert.typeLabel}
          </p>
          <p className="mt-1 text-sm font-semibold text-white">{alert.title}</p>
          <p className="mt-1 text-sm leading-5 text-white/90">{alert.message}</p>
          <p className="mt-1 text-xs text-white/70">
            {alert.expiresAtLabel}
            <span aria-hidden="true"> · </span>
            {alert.updatedAtLabel}
          </p>
        </div>
      </div>
    </section>
  );
}
