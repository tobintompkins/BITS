import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import Link from "next/link";

export default function Home() {
  return (
    <main className="bg-zinc-50">
      <div className="mx-auto flex min-h-full w-full max-w-7xl flex-1 flex-col gap-12 px-6 py-16">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
              BITS
            </p>
            <h1 className="text-2xl font-semibold text-zinc-900">
              Bring In The Sheaves
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Show when="signed-out">
              <SignInButton mode="redirect">
                <button
                  type="button"
                  className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900"
                >
                  Sign in
                </button>
              </SignInButton>
              <SignUpButton mode="redirect">
                <button
                  type="button"
                  className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
                >
                  Sign up
                </button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <div className="flex items-center gap-3">
                <Link
                  href="/dashboard"
                  className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
                >
                  Open dashboard
                </Link>
                <UserButton />
              </div>
            </Show>
          </div>
        </header>

        <section className="grid gap-8 rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)] lg:p-12">
          <div className="space-y-6">
            <div className="space-y-3">
              <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
                Church Giving Management
              </p>
              <h2 className="max-w-3xl text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
                A modern foundation for donors, households, giving, and
                contribution statements.
              </h2>
            </div>

            <p className="max-w-2xl text-base leading-7 text-zinc-600">
              BITS is being built as a secure, multi-tenant application for
              churches and charitable faith organizations to manage donor
              records, offering batches, reporting, and statement delivery.
            </p>

            <div className="flex flex-wrap gap-3">
              <Show when="signed-out">
                <SignInButton mode="redirect">
                  <button
                    type="button"
                    className="rounded-md bg-zinc-900 px-5 py-3 text-sm font-medium text-white"
                  >
                    Sign in to BITS
                  </button>
                </SignInButton>
                <SignUpButton mode="redirect">
                  <button
                    type="button"
                    className="rounded-md border border-zinc-300 bg-white px-5 py-3 text-sm font-medium text-zinc-900"
                  >
                    Create an account
                  </button>
                </SignUpButton>
              </Show>
              <Show when="signed-in">
                <Link
                  href="/dashboard"
                  className="rounded-md bg-zinc-900 px-5 py-3 text-sm font-medium text-white"
                >
                  Open dashboard
                </Link>
              </Show>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-6">
            <h3 className="text-base font-semibold text-zinc-900">
              Current foundation
            </h3>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-zinc-600">
              <li>Authenticated staff shell with protected placeholder routes</li>
              <li>Navigation for core giving and reporting sections</li>
              <li>Prisma schema foundation for the Version 1 data model</li>
            </ul>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h3 className="text-base font-semibold text-zinc-900">
              Donors and Households
            </h3>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              Track individual donors and family relationships without mixing
              authentication and giving records.
            </p>
          </article>

          <article className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h3 className="text-base font-semibold text-zinc-900">
              Batches and Giving
            </h3>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              Capture offerings accurately with room for identified and
              anonymous gifts, multiple allocations, and reconciliation.
            </p>
          </article>

          <article className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h3 className="text-base font-semibold text-zinc-900">
              Reports and Statements
            </h3>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              Prepare for contribution reporting and donor statements while the
              business workflows are built in later steps.
            </p>
          </article>
        </section>
      </div>
    </main>
  );
}
