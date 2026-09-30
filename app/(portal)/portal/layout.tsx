import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DisplayOptions } from "@/components/accessibility/display-options";
import { MemberPortalNav } from "@/components/portal/member-portal-nav";

export default async function MemberPortalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <div className="min-h-screen bg-[var(--bits-page)]">
      <header className="portal-app-header border-b-4 border-[var(--bits-gold)] bg-[var(--bits-navy)] text-white shadow-sm">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:gap-4 sm:px-6">
          <Link href="/portal" className="flex min-w-0 items-center gap-3">
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
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <DisplayOptions />
            <MemberPortalNav />
            <UserButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
