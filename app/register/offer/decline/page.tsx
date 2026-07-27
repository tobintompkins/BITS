"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState, useTransition } from "react";

import { declinePromotionOfferAction } from "@/app/register/actions";

function DeclineForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  return (
    <div className="mt-6 space-y-4">
      {!token ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          This page requires a valid offer link from your notification.
        </p>
      ) : done ? (
        <p className="text-sm text-zinc-700 dark:text-zinc-300">{message}</p>
      ) : (
        <>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Declining releases the reserved seat so the next person on the waitlist
            can be offered a place.
          </p>
          {message ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              {message}
            </p>
          ) : null}
          <button
            type="button"
            disabled={isPending}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
            onClick={() => {
              startTransition(async () => {
                const formData = new FormData();
                formData.set("token", token);
                const result = await declinePromotionOfferAction(formData);
                setMessage(result.message);
                if (result.status === "success") setDone(true);
              });
            }}
          >
            {isPending ? "Declining…" : "Decline offer"}
          </button>
        </>
      )}
    </div>
  );
}

export default function DeclinePromotionOfferPage() {
  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Decline waitlist offer</h1>
      <Suspense fallback={<p className="mt-6 text-sm">Loading…</p>}>
        <DeclineForm />
      </Suspense>
    </main>
  );
}
