"use client";

import { useState, useTransition } from "react";

import { issueRegistrationQrPassAction } from "@/app/register/actions";
import { QrPassDisplay } from "@/components/events/qr-pass-display";

export function RegistrationQrPassPanel({
  confirmationCode,
}: {
  confirmationCode: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [pass, setPass] = useState<{
    fallbackCode: string | null;
    payload: string | null;
    expiresAt: string | Date;
  } | null>(null);

  return (
    <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        Check-in pass
      </h2>
      <p className="mt-1 text-xs text-zinc-500">
        Available when event check-in and QR passes are enabled.
      </p>
      {message ? <p className="mt-3 text-sm">{message}</p> : null}
      {pass ? (
        <div className="mt-4">
          <QrPassDisplay
            payload={pass.payload}
            fallbackCode={pass.fallbackCode}
          />
          <p className="mt-2 text-xs text-zinc-500">
            Expires {new Date(pass.expiresAt).toLocaleString()}
          </p>
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={isPending}
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
          onClick={() =>
            startTransition(async () => {
              const result = await issueRegistrationQrPassAction(
                confirmationCode,
                false,
              );
              if (result.status !== "success") {
                setMessage(result.message);
                return;
              }
              setPass({
                fallbackCode: result.fallbackCode,
                payload: result.payload,
                expiresAt: result.expiresAt,
              });
              setMessage(
                result.reused
                  ? "Existing pass loaded (rotate to reveal a new QR)."
                  : "Check-in pass issued.",
              );
            })
          }
        >
          {isPending ? "Working…" : "Get check-in pass"}
        </button>
        <button
          type="button"
          disabled={isPending}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
          onClick={() =>
            startTransition(async () => {
              const result = await issueRegistrationQrPassAction(
                confirmationCode,
                true,
              );
              if (result.status !== "success") {
                setMessage(result.message);
                return;
              }
              setPass({
                fallbackCode: result.fallbackCode,
                payload: result.payload,
                expiresAt: result.expiresAt,
              });
              setMessage("Pass rotated. Prior QR codes are revoked.");
            })
          }
        >
          Rotate pass
        </button>
      </div>
    </section>
  );
}
