type PublicPrayer = {
  id: string;
  requesterName: string | null;
  request: string;
};

export function PrayerWall({ requests }: { requests: PublicPrayer[] }) {
  return (
    <section
      aria-labelledby="prayer-wall-heading"
      className="border-b border-[var(--bits-border)] bg-white"
    >
      <div className="mx-auto grid w-full max-w-7xl gap-3 px-4 py-4 sm:px-6 lg:grid-cols-[210px_minmax(0,1fr)] lg:items-center lg:px-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-hover)]">
            Pray Together
          </p>
          <h2
            id="prayer-wall-heading"
            className="mt-1 text-lg font-semibold text-[var(--bits-navy)]"
          >
            Church Prayer Wall
          </h2>
        </div>

        {requests.length > 0 ? (
          <div className="overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)]">
            <div
              className={`flex w-max gap-3 ${
                requests.length > 1 ? "prayer-wall-track" : ""
              }`}
            >
              {[...requests, ...(requests.length > 1 ? requests : [])].map(
                (request, index) => (
                  <article
                    key={`${request.id}-${index}`}
                    className="w-72 shrink-0 rounded-xl border border-[var(--bits-border)] bg-[var(--bits-page)] px-4 py-3"
                    aria-hidden={index >= requests.length}
                  >
                    <p className="line-clamp-2 text-sm leading-5 text-[var(--foreground)]">
                      “{request.request}”
                    </p>
                    <p className="mt-1 text-xs font-semibold text-[var(--bits-gold-hover)]">
                      — {request.requesterName || "Anonymous"}
                    </p>
                  </article>
                ),
              )}
            </div>
          </div>
        ) : (
          <p className="rounded-xl bg-[var(--bits-page)] px-4 py-3 text-sm text-[var(--bits-muted)]">
            Public prayer requests will appear here. Use Prayer Request below
            to share one.
          </p>
        )}
      </div>
    </section>
  );
}
