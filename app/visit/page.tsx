import Link from "next/link";

const visitDetails = [
  {
    title: "Service Times",
    description: "Sunday Morning Worship at 10:30 AM · Wednesday Service at 7:00 PM",
  },
  {
    title: "Directions",
    description: "110 Old Orchard Rd, Saco, ME 04072",
    href: "https://www.google.com/search?sca_esv=e34115c41044c7f2&rlz=1C5AJCO_enUS1201US1201&sxsrf=APpeQns9uiVhytwXEvLKPNQAfIp5JByKlw:1785161850549&q=first+united+pentecostal+church+of+saco+maine+address&ludocid=15348520153780023797&sa=X&sqi=2&ved=2ahUKEwjcu9-PhvOVAxW95MkDHXlPD4AQ6BN6BAg-EAI",
  },
  {
    title: "What to Expect",
    description:
      "Come as you are. You will be welcomed by a church family that is glad you are here.",
  },
  {
    title: "Children & Family",
    description:
      "Children’s ministry, nursery, classroom, and check-in details will appear here.",
  },
];

export default function PlanYourVisitPage() {
  return (
    <main className="min-h-screen bg-[var(--bits-page)]">
      <header className="border-b-4 border-[var(--bits-gold)] bg-[var(--bits-navy)] text-white">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid h-10 w-10 place-items-center rounded-full border-2 border-[var(--bits-gold)] text-xl text-[var(--bits-gold)]"
            >
              ✝
            </span>
            <span>
              <span className="block text-xs font-bold uppercase tracking-[0.18em] text-[var(--bits-gold)]">
                First UPC of Saco
              </span>
              <span className="block font-semibold">Plan Your Visit</span>
            </span>
          </Link>
          <Link
            href="/"
            className="rounded-xl border border-white/30 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white hover:text-[var(--bits-navy)]"
          >
            Back Home
          </Link>
        </div>
      </header>

      <section className="bg-[var(--bits-navy-deep)] px-4 py-10 text-center text-white sm:px-6">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--bits-gold)]">
          We’re glad you’re coming
        </p>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">
          Plan Your Visit
        </h1>
        <p className="mx-auto mt-3 max-w-2xl leading-7 text-white/75">
          We want your first visit to feel comfortable, welcoming, and easy.
        </p>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-5 sm:grid-cols-2">
          {visitDetails.map((detail) => (
            <article
              key={detail.title}
              className="rounded-2xl border border-[var(--bits-border)] bg-white p-6 shadow-sm"
            >
              <span
                aria-hidden="true"
                className="block h-1 w-12 rounded-full bg-[var(--bits-gold)]"
              />
              <h2 className="mt-5 text-xl font-semibold text-[var(--bits-navy)]">
                {detail.title}
              </h2>
              {detail.href ? (
                <a
                  href={detail.href}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex text-sm font-semibold leading-6 text-[var(--bits-gold-hover)] underline decoration-[var(--bits-gold)] underline-offset-4 hover:text-[var(--bits-navy)]"
                >
                  {detail.description}
                  <span aria-hidden="true" className="ml-2">
                    ↗
                  </span>
                </a>
              ) : (
                <p className="mt-2 text-sm leading-6 text-[var(--bits-muted)]">
                  {detail.description}
                </p>
              )}
            </article>
          ))}
        </div>

        <div className="mt-8 rounded-2xl bg-[var(--bits-navy)] p-7 text-center text-white">
          <h2 className="text-xl font-semibold">We look forward to meeting you.</h2>
          <p className="mt-2 text-sm leading-6 text-white/75">
            Service times, address, directions, and contact details can be added
            as soon as the church provides the approved information.
          </p>
        </div>
      </section>
    </main>
  );
}
