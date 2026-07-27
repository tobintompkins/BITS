import Link from "next/link";
import { notFound } from "next/navigation";

import { getConfirmationAction } from "@/app/register/actions";
import { RegistrationQrPassPanel } from "@/components/events/registration-qr-pass-panel";
import {
  eventRegistrationStatusOptions,
  formatRegistrationEnumLabel,
} from "@/lib/constants/event-registration";

type PageProps = {
  params: Promise<{ code: string }>;
};

export default async function RegistrationConfirmationPage({
  params,
}: PageProps) {
  const { code } = await params;

  let registration: Awaited<ReturnType<typeof getConfirmationAction>>;
  try {
    registration = await getConfirmationAction(code);
  } catch {
    notFound();
  }

  const showQrPass = ["PENDING", "CONFIRMED", "CHECKED_IN"].includes(
    registration.status,
  );

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-10">
      <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
        BITS Registration
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        Confirmation
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
        {registration.event.title} ·{" "}
        {new Date(registration.event.startDateTime).toLocaleString()}
      </p>

      <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-zinc-500">Confirmation code</dt>
            <dd className="font-mono text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {registration.confirmationCode}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Status</dt>
            <dd>
              {formatRegistrationEnumLabel(
                eventRegistrationStatusOptions,
                registration.status,
              )}
              {registration.waitlistPosition != null
                ? ` · #${registration.waitlistPosition}`
                : ""}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Contact</dt>
            <dd>{registration.primaryContactName}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Party size</dt>
            <dd>{registration.partySize}</dd>
          </div>
        </dl>

        <h2 className="mt-6 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Attendees
        </h2>
        <ul className="mt-2 space-y-2 text-sm text-zinc-600 dark:text-zinc-300">
          {registration.attendees.map((attendee) => (
            <li key={attendee.id}>
              {attendee.firstName} {attendee.lastName}
              {attendee.isGuest ? " (guest)" : ""} · {attendee.status}
            </li>
          ))}
        </ul>
      </section>

      {showQrPass ? (
        <RegistrationQrPassPanel
          confirmationCode={registration.confirmationCode}
        />
      ) : null}

      <p className="mt-6 text-center text-sm text-zinc-500">
        <Link href="/register/cancel" className="underline-offset-4 hover:underline">
          Cancel this registration
        </Link>
      </p>
    </main>
  );
}
