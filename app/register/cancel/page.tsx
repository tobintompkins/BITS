"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { cancelPublicRegistrationAction } from "@/app/register/actions";

const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950";

export default function CancelRegistrationPage() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 py-10">
      <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
        BITS Registration
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        Cancel registration
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
        Enter your confirmation code. If an email was provided at registration,
        include it for verification.
      </p>

      <form
        className={`mt-8 space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 ${
          isPending ? "opacity-70" : ""
        }`}
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          startTransition(async () => {
            const result = await cancelPublicRegistrationAction(formData);
            setMessage(result.message);
            setSuccess(result.status === "success");
          });
        }}
      >
        {message ? (
          <p
            className={`rounded-md border px-3 py-2 text-sm ${
              success
                ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
                : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
            }`}
          >
            {message}
          </p>
        ) : null}
        <label className="block text-sm">
          <span className="font-medium">Confirmation code</span>
          <input
            name="confirmationCode"
            required
            className={`${inputClass} font-mono uppercase`}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Email (if required)</span>
          <input name="email" type="email" className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Reason (optional)</span>
          <textarea name="reason" rows={2} className={inputClass} />
        </label>
        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          {isPending ? "Cancelling…" : "Cancel registration"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-zinc-500">
        <Link href="/" className="underline-offset-4 hover:underline">
          Back to home
        </Link>
      </p>
    </main>
  );
}
