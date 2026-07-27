"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";

import { QrPassDisplay } from "@/components/events/qr-pass-display";
import {
  issueQrPass,
  listQrPasses,
  mapQrPassFailureMessage,
  revokeQrPass,
  rotateQrPass,
  type QrPassMetadata,
} from "@/lib/api/qr-pass-client";
import {
  clearEphemeralSecret,
  pickActivePartyPass,
  toQrDisplayPayload,
  type EphemeralQrSecret,
} from "@/lib/events/qr-pass-ui";

type AttendeeOption = {
  id: string;
  firstName: string;
  lastName: string;
  status: string;
};

type Props = {
  eventId: string;
  registrationId: string;
  confirmationCode: string;
  registrationStatus: string;
  attendees: AttendeeOption[];
  canManage: boolean;
};

/**
 * Blueprint 7.3S — staff QR pass management for one registration.
 * Raw tokens stay in component memory only; never written to storage/URL.
 * Remount via `key={registrationId}` from the parent to clear secrets on change.
 */
export function StaffQrPassPanel({
  eventId,
  registrationId,
  confirmationCode,
  registrationStatus,
  attendees,
  canManage,
}: Props) {
  const headingId = useId();
  const statusId = useId();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [items, setItems] = useState<QrPassMetadata[]>([]);
  const [secret, setSecret] = useState<EphemeralQrSecret | null>(null);
  const [binding, setBinding] = useState<"PARTY" | string>("PARTY");
  const mountedRef = useRef(true);
  const loadedForRef = useRef<string | null>(null);

  const activeParty = pickActivePartyPass(items);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!canManage) return;
    if (loadedForRef.current === registrationId) return;
    loadedForRef.current = registrationId;
    startTransition(async () => {
      const result = await listQrPasses(eventId, registrationId);
      if (!mountedRef.current) return;
      if (!result.ok) {
        setMessage(mapQrPassFailureMessage(result));
        return;
      }
      setItems(result.data.items);
    });
  }, [canManage, eventId, registrationId]);

  if (!canManage) return null;

  function announce(next: string) {
    setMessage(next);
  }

  function refreshMetadata() {
    return listQrPasses(eventId, registrationId).then((result) => {
      if (!mountedRef.current) return;
      if (!result.ok) {
        announce(mapQrPassFailureMessage(result));
        return;
      }
      setItems(result.data.items);
    });
  }

  function runIssue() {
    if (isPending) return;
    const attendeeId = binding === "PARTY" ? null : binding;
    startTransition(async () => {
      const result = await issueQrPass(eventId, registrationId, attendeeId);
      if (!mountedRef.current) return;
      if (!result.ok) {
        announce(mapQrPassFailureMessage(result));
        return;
      }
      if (result.data.reused || !result.data.rawToken) {
        setSecret(clearEphemeralSecret());
        announce(
          "An active pass already exists. Rotate it to display a new QR code — the previous secret cannot be recovered.",
        );
      } else {
        setSecret({
          passId: result.data.id,
          rawToken: result.data.rawToken,
          expiresAt: result.data.expiresAt,
        });
        announce("Check-in pass issued. Display this QR only to authorized holders.");
      }
      await refreshMetadata();
    });
  }

  function runRotate(passId: string) {
    if (isPending) return;
    const confirmed = window.confirm(
      "Rotate this pass? The current QR code will stop working immediately.",
    );
    if (!confirmed) return;
    startTransition(async () => {
      setSecret(clearEphemeralSecret());
      const result = await rotateQrPass(eventId, registrationId, passId);
      if (!mountedRef.current) return;
      if (!result.ok) {
        announce(mapQrPassFailureMessage(result));
        await refreshMetadata();
        return;
      }
      if (!result.data.rawToken) {
        announce("Rotation completed, but no displayable secret was returned.");
      } else {
        setSecret({
          passId: result.data.id,
          rawToken: result.data.rawToken,
          expiresAt: result.data.expiresAt,
        });
        announce("Pass rotated. Only the new QR is valid.");
      }
      await refreshMetadata();
    });
  }

  function runRevoke(passId: string) {
    if (isPending) return;
    const confirmed = window.confirm(
      "Revoke this pass? It cannot be undone, and any displayed QR will be cleared.",
    );
    if (!confirmed) return;
    startTransition(async () => {
      setSecret(clearEphemeralSecret());
      const result = await revokeQrPass(eventId, registrationId, passId);
      if (!mountedRef.current) return;
      if (!result.ok) {
        announce(mapQrPassFailureMessage(result));
        return;
      }
      announce(
        result.data.transitioned
          ? "Pass revoked. It is no longer valid for check-in."
          : `Pass is already ${result.data.status.toLowerCase()}.`,
      );
      await refreshMetadata();
    });
  }

  const eligibleAttendees = attendees.filter((a) =>
    ["REGISTERED", "CONFIRMED", "CHECKED_IN"].includes(a.status),
  );

  return (
    <section
      className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-950/40 print:border-0 print:bg-white"
      aria-labelledby={headingId}
    >
      <h3
        id={headingId}
        className="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
      >
        QR check-in pass · {confirmationCode}
      </h3>
      <p className="mt-1 text-xs text-zinc-500">
        Registration status: {registrationStatus}. Secrets display only right
        after issue or rotate; screenshots are outside app control.
      </p>

      <div
        id={statusId}
        role="status"
        aria-live="polite"
        className="mt-2 text-sm text-zinc-700 dark:text-zinc-300"
      >
        {message}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2 print:hidden">
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Binding
          <select
            className="mt-1 block rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            value={binding}
            disabled={isPending}
            onChange={(event) => setBinding(event.target.value)}
          >
            <option value="PARTY">Party (whole registration)</option>
            {eligibleAttendees.map((attendee) => (
              <option key={attendee.id} value={attendee.id}>
                {attendee.firstName} {attendee.lastName}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={isPending}
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
          onClick={runIssue}
        >
          {isPending ? "Working…" : "Issue pass"}
        </button>
        {activeParty ? (
          <>
            <button
              type="button"
              disabled={isPending}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
              onClick={() => runRotate(activeParty.id)}
            >
              Rotate
            </button>
            <button
              type="button"
              disabled={isPending}
              className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:text-red-300"
              onClick={() => runRevoke(activeParty.id)}
            >
              Revoke
            </button>
          </>
        ) : null}
        {secret ? (
          <button
            type="button"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
            onClick={() => setSecret(clearEphemeralSecret())}
          >
            Hide QR
          </button>
        ) : null}
      </div>

      <ul className="mt-3 space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
        {items.length === 0 ? (
          <li>No passes yet for this registration.</li>
        ) : (
          items.map((pass) => (
            <li key={pass.id}>
              {pass.bindingType} · {pass.status} · expires{" "}
              {new Date(pass.expiresAt).toLocaleString()}
              {pass.revokedAt
                ? ` · revoked ${new Date(pass.revokedAt).toLocaleString()}`
                : ""}
            </li>
          ))
        )}
      </ul>

      {secret ? (
        <div className="mt-4 print:mt-2">
          <QrPassDisplay
            payload={toQrDisplayPayload(secret.rawToken)}
            fallbackCode={null}
            label="Event check-in pass QR"
          />
          <p className="mt-2 text-xs text-zinc-500">
            Expires {new Date(secret.expiresAt).toLocaleString()}. Do not share
            beyond the authorized holder.
          </p>
        </div>
      ) : activeParty ? (
        <p className="mt-3 text-xs text-zinc-500">
          An active pass exists, but its secret cannot be recovered. Rotate to
          display a new QR.
        </p>
      ) : null}
    </section>
  );
}
