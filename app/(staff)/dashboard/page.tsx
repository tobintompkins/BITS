import Link from "next/link";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          BITS
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
          Dashboard
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-zinc-600">
          A simple staff landing area for donors, households, giving batches,
          reporting, and statements. Real data and workflows will be added in
          later steps.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Link
          href="/donors"
          className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-colors hover:border-zinc-300"
        >
          <h2 className="text-base font-semibold text-zinc-900">Donors</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Manage donor records and later connect giving history.
          </p>
        </Link>

        <Link
          href="/households"
          className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-colors hover:border-zinc-300"
        >
          <h2 className="text-base font-semibold text-zinc-900">Households</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Maintain household groupings and shared statement preferences.
          </p>
        </Link>

        <Link
          href="/batches"
          className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-colors hover:border-zinc-300"
        >
          <h2 className="text-base font-semibold text-zinc-900">Batches</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Enter and review offering batches before financial workflows are
            implemented.
          </p>
        </Link>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-900">
          Current foundation
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Authentication is enabled and the staff shell is in place. Organization
          context, permissions, and business features are intentionally deferred
          to future slices.
        </p>
      </section>
    </div>
  );
}
