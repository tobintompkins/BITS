import {
  CHURCH_LEADERSHIP_HEADING,
  CHURCH_LEADERSHIP_NAMES,
} from "@/lib/church/leadership";

const TITLE_WORDS = new Set([
  "pastor",
  "rev",
  "reverend",
  "dr",
  "mr",
  "mrs",
  "ms",
]);

function leadershipInitials(name: string) {
  const parts = name
    .split(/\s+/)
    .filter((part) => !TITLE_WORDS.has(part.toLowerCase().replace(/\./g, "")));

  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function ChurchLeadershipCard() {
  return (
    <section
      aria-labelledby="church-leadership-heading"
      className="border-b border-[var(--bits-border)] bg-white"
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-hover)]">
            First UPC of Saco
          </p>
          <h2
            id="church-leadership-heading"
            className="mt-2 text-2xl font-semibold text-[var(--bits-navy-deep)]"
          >
            {CHURCH_LEADERSHIP_HEADING}
          </h2>
        </div>

        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {CHURCH_LEADERSHIP_NAMES.map((name) => (
            <li
              key={name}
              className="flex items-center gap-4 rounded-2xl border border-[var(--bits-border)] bg-[var(--bits-page)] px-5 py-5"
            >
              <span
                aria-hidden="true"
                className="grid h-14 w-14 shrink-0 place-items-center rounded-full border-2 border-[var(--bits-gold)] bg-[var(--bits-navy)] text-lg font-semibold text-[var(--bits-gold)]"
              >
                {leadershipInitials(name)}
              </span>
              <p className="text-lg font-semibold text-[var(--bits-navy)]">
                {name}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
