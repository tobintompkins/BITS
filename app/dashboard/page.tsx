import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            BITS
          </p>
          <h1 className="text-3xl font-semibold text-zinc-900">Dashboard</h1>
        </div>
        <UserButton />
      </header>

      <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-zinc-700">
          You are signed in. Organization and role features will be added in a
          later step.
        </p>
      </section>

      <Link
        href="/"
        className="text-sm font-medium text-zinc-600 underline-offset-4 hover:underline"
      >
        Back to home
      </Link>
    </main>
  );
}
