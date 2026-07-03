import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-16">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            BITS
          </p>
          <h1 className="text-3xl font-semibold text-zinc-900">
            Bring In The Sheaves
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Show when="signed-out">
            <SignInButton mode="redirect">
              <button
                type="button"
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900"
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
            <UserButton />
          </Show>
        </div>
      </header>

      <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-zinc-700">
          Authentication foundation placeholder. Sign in to access the protected
          dashboard.
        </p>
        <Link
          href="/dashboard"
          className="mt-4 inline-block text-sm font-medium text-zinc-900 underline-offset-4 hover:underline"
        >
          Go to dashboard
        </Link>
      </section>
    </main>
  );
}
