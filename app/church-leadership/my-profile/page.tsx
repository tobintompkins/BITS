import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { DisplayOptions } from "@/components/accessibility/display-options";
import { MyChurchProfileForm } from "@/components/church/my-church-profile-form";
import { ownChurchProfile } from "@/server/services/church-person-profile.service";

export const metadata: Metadata = {
  title: "Update my profile | First UPC of Saco",
};

export default async function MyPublicChurchProfilePage() {
  await connection();
  const own = await ownChurchProfile();
  return (
    <main className="min-h-screen bg-[var(--bits-page)]">
      <header className="border-b-4 border-[var(--bits-gold)] bg-[var(--bits-navy)] text-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/church-leadership" className="font-semibold">
            First UPC of Saco
          </Link>
          <div className="flex items-center gap-3">
            <DisplayOptions />
            <Link
              href="/church-leadership"
              className="rounded-xl border border-white/30 px-4 py-2 text-sm font-semibold hover:bg-white hover:text-[var(--bits-navy)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            >
              Meet Our Team
            </Link>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-3xl gap-6 px-4 py-10 sm:px-6">
        <header>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
            Personal church profile
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">Update my profile</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--bits-muted)]">
            Your sign-in creates a private profile for you. You can change your own photo and introduction. An existing church card is connected only by an administrator.
          </p>
        </header>
        {own.status === "SIGNED_OUT" ? (
          <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5">
            <p className="text-sm leading-6 text-[var(--bits-navy)]">
              Sign in to update your own profile. You can change only the profile connected to your account.
            </p>
            <Link
              href="/sign-in?redirect_url=/church-leadership/my-profile"
              className="mt-4 inline-flex rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            >
              Sign in
            </Link>
          </section>
        ) : null}
        {own.status === "NO_PROFILE" ? (
          <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5">
            <p className="text-sm leading-6 text-[var(--bits-navy)]">
              Choose your church before a personal profile can be created. Suspended or removed access is not restored, and a matching name or email does not claim another person&apos;s card.
            </p>
          </section>
        ) : null}
        {own.status === "READY" ? (
          <section className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 sm:p-8">
            <h2 className="text-xl font-semibold text-[var(--bits-navy)]">{own.profile.officialName}</h2>
            <div className="mt-4">
              <MyChurchProfileForm profile={own.profile} />
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
