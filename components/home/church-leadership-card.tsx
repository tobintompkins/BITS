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

export function ChurchLeadershipCard({
  heading = CHURCH_LEADERSHIP_HEADING,
  names = CHURCH_LEADERSHIP_NAMES,
  headingId = "church-leadership-heading",
}: {
  heading?: string;
  names?: readonly string[];
  headingId?: string;
} = {}) {
  return (
    <section
      aria-labelledby={headingId}
      className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8"
    >
      <div className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <h2
            id={headingId}
            className="text-lg font-semibold text-[var(--bits-navy-deep)]"
          >
            {heading}
          </h2>
        </div>

        <ul className="mt-5 grid max-w-3xl gap-3 sm:grid-cols-2">
          {names.map((name) => (
            <li
              key={name}
              className="flex items-center gap-3 rounded-xl border border-[var(--bits-border)] bg-[var(--bits-page)] p-4"
            >
              <span
                aria-hidden="true"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 border-[var(--bits-gold)] bg-[var(--bits-navy)] text-sm font-semibold text-[var(--bits-gold)]"
              >
                {leadershipInitials(name)}
              </span>
              <p className="min-w-0 break-words text-base font-semibold leading-snug text-[var(--bits-navy)]">
                {name}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
