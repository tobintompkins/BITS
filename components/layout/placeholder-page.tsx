type PlaceholderPageProps = {
  title: string;
  description: string;
};

export function PlaceholderPage({
  title,
  description,
}: PlaceholderPageProps) {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          BITS
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
          {title}
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-zinc-600">
          {description}
        </p>
      </header>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-sm leading-6 text-zinc-700">
          This section is part of the app foundation. Data, workflows, and
          permissions will be added in later implementation steps.
        </p>
      </section>
    </div>
  );
}
