import { redirect } from "next/navigation";

import { StaffInvitationAcceptForm } from "@/components/staff/staff-invitation-accept-form";
import { previewStaffInvitationAcceptance } from "@/server/services/staff-invitation-accept.service";

export default async function StaffInvitationAcceptPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string }>;
}) {
  const query = await searchParams;
  const preview = await previewStaffInvitationAcceptance({
    invitationId: query.intent,
  });

  if (preview.status === "SIGNED_OUT") redirect("/sign-in");

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-10">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
          Staff onboarding
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
          Accept staff access
        </h1>
        <p className="mt-2 text-sm leading-6 text-[var(--bits-muted)]">
          {preview.message}
        </p>
      </header>
      {preview.status === "READY" ? (
        <StaffInvitationAcceptForm
          invitationId={preview.invitationId}
          summary={preview.message}
        />
      ) : null}
    </main>
  );
}
