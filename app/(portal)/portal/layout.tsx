import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function MemberPortalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <div className="min-h-screen bg-[var(--bits-page)]">
      <header className="portal-app-header border-b-4 border-[var(--bits-gold)] bg-[var(--bits-navy)] text-white shadow-sm">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/portal" className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid h-10 w-10 place-items-center rounded-full border-2 border-[var(--bits-gold)] text-xl text-[var(--bits-gold)]"
            >
              ✝
            </span>
            <span>
              <span className="block text-xs font-bold uppercase tracking-[0.18em] text-[var(--bits-gold)]">
                BITS · Member Portal
              </span>
              <span className="block font-semibold">First UPC of Saco</span>
            </span>
          </Link>
          <nav aria-label="Member portal" className="flex items-center gap-4">
            <Link
              href="/portal/gifts"
              className="hidden text-sm text-white/80 hover:text-white sm:inline"
            >
              My Giving History
            </Link>
            <Link
              href="/portal/statements"
              className="hidden text-sm text-white/80 hover:text-white sm:inline"
            >
              My Statements
            </Link>
            <Link
              href="/portal/household"
              className="hidden text-sm text-white/80 hover:text-white sm:inline"
            >
              My Household
            </Link>
            <Link
              href="/portal/ministries"
              className="hidden text-sm text-white/80 hover:text-white sm:inline"
            >
              My Ministries
            </Link>
            <Link
              href="/portal/attendance"
              className="hidden text-sm text-white/80 hover:text-white sm:inline"
            >
              My Attendance
            </Link>
            <Link
              href="/portal/milestones"
              className="hidden text-sm text-white/80 hover:text-white sm:inline"
            >
              My Milestones
            </Link>
            <Link
              href="/portal/events"
              className="hidden text-sm text-white/80 hover:text-white sm:inline"
            >
              My Event Registrations
            </Link>
            <Link
              href="/portal/announcements"
              className="hidden text-sm text-white/80 hover:text-white sm:inline"
            >
              Church Announcements
            </Link>
            <Link
              href="/portal/profile"
              className="hidden text-sm text-white/80 hover:text-white sm:inline"
            >
              My Profile &amp; Preferences
            </Link>
            <Link
              href="/portal/help"
              className="hidden text-sm text-white/80 hover:text-white sm:inline"
            >
              Help &amp; Contact
            </Link>
            <Link
              href="/portal/privacy"
              className="hidden text-sm text-white/80 hover:text-white sm:inline"
            >
              Privacy &amp; Data
            </Link>
            <Link
              href="/"
              className="hidden text-sm text-white/80 hover:text-white sm:inline"
            >
              Public Home
            </Link>
            <UserButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
