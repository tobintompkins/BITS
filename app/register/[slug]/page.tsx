import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getPublicRegistrationPageAction,
} from "@/app/register/actions";
import { PublicRegistrationForm } from "@/components/events/public-registration-form";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function PublicRegisterPage({ params }: PageProps) {
  const { slug } = await params;

  let page: Awaited<ReturnType<typeof getPublicRegistrationPageAction>>;
  try {
    page = await getPublicRegistrationPageAction(slug);
  } catch {
    notFound();
  }

  const { event, settings, summary } = page;

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-10">
      <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
        BITS Registration
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        {event.title}
      </h1>
      {event.shortDescription ? (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          {event.shortDescription}
        </p>
      ) : null}
      <p className="mt-2 text-sm text-zinc-500">
        {new Date(event.startDateTime).toLocaleString()}
        {event.location ? ` · ${event.location.name}` : ""}
      </p>

      {summary.capacityRemaining != null ? (
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
          {summary.capacityRemaining} spot
          {summary.capacityRemaining === 1 ? "" : "s"} remaining
          {summary.waitlistCount != null && summary.waitlistCount > 0
            ? ` · ${summary.waitlistCount} on waitlist`
            : ""}
        </p>
      ) : null}

      {settings.instructions ? (
        <p className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          {settings.instructions}
        </p>
      ) : null}

      <div className="mt-8">
        <PublicRegistrationForm
          eventId={event.id}
          slug={event.slug}
          settings={{
            requireEmail: settings.requireEmail,
            requirePhone: settings.requirePhone,
            requireDateOfBirth: settings.requireDateOfBirth,
            requireEmergencyContact: settings.requireEmergencyContact,
            requireGuardianForMinors: settings.requireGuardianForMinors,
            allowGuestRegistration: settings.allowGuestRegistration,
            maxAttendeesPerRegistration: settings.maxAttendeesPerRegistration,
          }}
        />
      </div>

      <p className="mt-8 text-center text-sm text-zinc-500">
        Need to cancel?{" "}
        <Link href="/register/cancel" className="underline-offset-4 hover:underline">
          Cancel by confirmation code
        </Link>
      </p>
    </main>
  );
}
