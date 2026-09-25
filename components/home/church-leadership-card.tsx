import {
  CHURCH_LEADERSHIP_HEADING,
  CHURCH_LEADERSHIP_NAMES,
} from "@/lib/church/leadership";

export function ChurchLeadershipCard() {
  return (
    <article className="rounded-2xl border border-[var(--bits-border)] bg-white p-6 shadow-sm">
      <span
        aria-hidden="true"
        className="block h-1 w-12 rounded-full bg-[var(--bits-gold)]"
      />
      <h2 className="mt-5 text-xl font-semibold text-[var(--bits-navy)]">
        {CHURCH_LEADERSHIP_HEADING}
      </h2>
      <ul className="mt-4 space-y-2 text-sm font-medium text-[var(--bits-navy)]">
        {CHURCH_LEADERSHIP_NAMES.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
    </article>
  );
}
