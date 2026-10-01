import Link from "next/link";
import { notFound } from "next/navigation";

import { ChildPickupCheckoutPanel } from "@/components/events/child-pickup-checkout-panel";
import { getVerifiedChildCheckOutPage } from "@/server/services/child-pickup-checkout.service";

export default async function VerifiedChildCheckOutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const view = await getVerifiedChildCheckOutPage(id);

  if (view.status !== "READY") {
    notFound();
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <nav className="flex flex-wrap gap-3 text-sm" aria-label="Event links">
        <Link
          href={`/events/${view.eventId}`}
          className="font-medium text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          Event detail
        </Link>
        <Link
          href={view.staffCheckInHref}
          className="font-medium text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          Full staff check-in
        </Link>
      </nav>
      <ChildPickupCheckoutPanel
        eventId={view.eventId}
        eventTitle={view.eventTitle}
        allowCheckOut={view.allowCheckOut}
        staffCheckInHref={view.staffCheckInHref}
      />
    </main>
  );
}
