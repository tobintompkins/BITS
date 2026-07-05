import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShellNav } from "@/components/layout/app-shell-nav";

export default async function StaffLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  return (
    <div className="min-h-full bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
              BITS
            </p>
            <h1 className="text-lg font-semibold text-zinc-900">
              Bring In The Sheaves
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm font-medium text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline"
            >
              Public site
            </Link>
            <UserButton />
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="h-fit rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-zinc-900">Navigation</h2>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              Placeholder staff areas for the BITS application shell.
            </p>
          </div>

          <AppShellNav />
        </aside>

        <main>{children}</main>
      </div>
    </div>
  );
}
