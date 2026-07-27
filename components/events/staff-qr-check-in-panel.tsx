"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type FormEvent,
} from "react";

import { getStaffCheckInPartyAttendeesAction } from "@/app/(staff)/events/check-in-actions";
import {
  mapQrCheckInFailureMessage,
  resolveQrCheckInToken,
  submitQrCheckIn,
  type QrResolveResponse,
} from "@/lib/api/qr-check-in-client";
import { STAFF_PARTY_CHECK_IN_MAX_ATTENDEES } from "@/lib/constants/staff-party-check-in";
import { clearEphemeralQrCheckInToken } from "@/lib/events/qr-check-in-ui";
import {
  isQrCameraDecoderAvailable,
  normalizeScannedQrToken,
} from "@/lib/events/qr-scan-token";
import {
  createQrBarcodeDetector,
  detachVideoStream,
  detectQrFromVideo,
  startQrVideoStream,
  stopMediaStream,
  type QrCameraPermissionState,
} from "@/lib/events/qr-scanner-camera";
import { toggleStaffPartyAttendeeSelection } from "@/lib/events/staff-party-check-in-selection";
import {
  isStationClosedCheckInFailure,
  partyCheckInSuccessMessage,
  singleCheckInSuccessMessage,
  stationIdForCheckInRequest,
} from "@/lib/events/staff-check-in-station-selection";

type Feedback =
  | { tone: "success" | "info" | "error"; message: string }
  | null;

type EligibleAttendee = {
  id: string;
  firstName: string;
  lastName: string;
};

type Phase = "idle" | "scanning" | "resolving" | "resolved" | "checkingIn";

function feedbackClass(tone: NonNullable<Feedback>["tone"]) {
  if (tone === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100";
  }
  if (tone === "info") {
    return "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100";
  }
  return "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100";
}

/**
 * Blueprint 7.3V — staff QR scan / paste → 7.3U resolve → explicit check-in.
 * Camera uses native BarcodeDetector when available; manual fallback always works.
 * Raw tokens stay in a ref only; never URL/storage/logs.
 */
export function StaffQrCheckInPanel({
  eventId,
  stationId = "",
  stationName = null,
  onStationClosed,
}: {
  eventId: string;
  stationId?: string;
  stationName?: string | null;
  onStationClosed?: () => void;
}) {
  const headingId = useId();
  const feedbackId = useId();
  const manualId = useId();
  const selectionErrorId = useId();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionGenRef = useRef(0);
  const stopDetectRef = useRef(false);
  const rawTokenRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const cameraSupported = useSyncExternalStore(
    () => () => {},
    () => isQrCameraDecoderAvailable(),
    () => false,
  );
  const [phase, setPhase] = useState<Phase>("idle");
  const [cameraState, setCameraState] =
    useState<QrCameraPermissionState>("idle");
  const [manualValue, setManualValue] = useState("");
  const [resolved, setResolved] = useState<QrResolveResponse | null>(null);
  const [eligible, setEligible] = useState<EligibleAttendee[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [loadingNames, startLoadNames] = useTransition();

  function stopCameraSession() {
    stopDetectRef.current = true;
    sessionGenRef.current += 1;
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    detachVideoStream(videoRef.current);
    setCameraState((prev) =>
      prev === "pending" || prev === "granted" ? "idle" : prev,
    );
    setPhase((prev) => (prev === "scanning" ? "idle" : prev));
  }

  function resetSession(options?: { keepFeedback?: boolean }) {
    stopCameraSession();
    abortRef.current?.abort();
    abortRef.current = null;
    clearEphemeralQrCheckInToken(rawTokenRef);
    setManualValue("");
    setResolved(null);
    setEligible([]);
    setSelectedIds([]);
    setSelectionError(null);
    setPhase("idle");
    if (!options?.keepFeedback) setFeedback(null);
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopDetectRef.current = true;
      sessionGenRef.current += 1;
      abortRef.current?.abort();
      // Stopping tracks is sufficient on unmount; the video element is gone with the tree.
      stopMediaStream(streamRef.current);
      streamRef.current = null;
      clearEphemeralQrCheckInToken(rawTokenRef);
    };
  }, []);

  async function beginResolve(token: string) {
    stopCameraSession();
    setManualValue("");
    setSelectionError(null);
    setFeedback(null);
    setPhase("resolving");
    rawTokenRef.current = token;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const result = await resolveQrCheckInToken({
      eventId,
      token,
      signal: controller.signal,
    });

    if (!mountedRef.current || controller.signal.aborted) return;

    if (!result.ok) {
      clearEphemeralQrCheckInToken(rawTokenRef);
      setPhase("idle");
      setFeedback({
        tone: "error",
        message: mapQrCheckInFailureMessage(result),
      });
      return;
    }

    setResolved(result.data);
    setPhase("resolved");

    if (result.data.bindingType === "ATTENDEE" && result.data.attendeeId) {
      setSelectedIds([result.data.attendeeId]);
    } else {
      setSelectedIds([]);
    }

    startLoadNames(async () => {
      const party = await getStaffCheckInPartyAttendeesAction(
        eventId,
        result.data.registrationId,
      );
      if (!mountedRef.current) return;
      if (party.status !== "success") {
        setEligible(
          result.data.eligibleAttendeeIds.map((id) => ({
            id,
            firstName: "Attendee",
            lastName: id.slice(0, 8),
          })),
        );
        return;
      }
      const allowed = new Set(result.data.eligibleAttendeeIds);
      setEligible(
        party.party.attendees
          .filter((row) => allowed.has(row.id))
          .map((row) => ({
            id: row.id,
            firstName: row.firstName,
            lastName: row.lastName,
          })),
      );
    });
  }

  async function handleStartCamera() {
    setFeedback(null);
    if (!isQrCameraDecoderAvailable()) {
      setCameraState("unavailable");
      setFeedback({
        tone: "info",
        message:
          "Camera scanning is unavailable in this browser. Enter or paste a pass code below.",
      });
      return;
    }

    const detector = createQrBarcodeDetector();
    if (!detector) {
      setCameraState("unavailable");
      setFeedback({
        tone: "info",
        message:
          "QR decoding is unavailable here. Enter or paste a pass code below.",
      });
      return;
    }

    const sessionId = ++sessionGenRef.current;
    stopDetectRef.current = false;
    setCameraState("pending");
    setPhase("scanning");

    try {
      const stream = await startQrVideoStream();
      if (!mountedRef.current || sessionGenRef.current !== sessionId) {
        stopMediaStream(stream);
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stopMediaStream(stream);
        streamRef.current = null;
        setCameraState("error");
        setPhase("idle");
        setFeedback({
          tone: "error",
          message: "Camera preview failed to start. Use the pass code field.",
        });
        return;
      }
      video.srcObject = stream;
      await video.play();
      if (!mountedRef.current || sessionGenRef.current !== sessionId) {
        stopCameraSession();
        return;
      }
      setCameraState("granted");

      const value = await detectQrFromVideo({
        video,
        detector,
        shouldStop: () =>
          stopDetectRef.current || sessionGenRef.current !== sessionId,
      });

      if (!mountedRef.current || sessionGenRef.current !== sessionId) {
        stopCameraSession();
        return;
      }

      stopCameraSession();

      if (!value) {
        setFeedback({
          tone: "info",
          message: "No QR code captured. Try again or enter the pass code.",
        });
        return;
      }

      const opaque = normalizeScannedQrToken(value);
      if (!opaque) {
        setFeedback({
          tone: "error",
          message: "This pass cannot be used. Ask for a new pass if needed.",
        });
        return;
      }
      await beginResolve(opaque);
    } catch (error) {
      if (!mountedRef.current || sessionGenRef.current !== sessionId) return;
      stopCameraSession();
      const name =
        error && typeof error === "object" && "name" in error
          ? String((error as { name: string }).name)
          : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setCameraState("denied");
        setFeedback({
          tone: "error",
          message:
            "Camera permission was denied. Enter or paste a pass code instead.",
        });
        return;
      }
      if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setCameraState("unavailable");
        setFeedback({
          tone: "error",
          message: "No camera was found. Enter or paste a pass code instead.",
        });
        return;
      }
      setCameraState("error");
      setFeedback({
        tone: "error",
        message:
          "Camera could not start. Enter or paste a pass code instead.",
      });
    }
  }

  function handleStopCamera() {
    stopCameraSession();
    setFeedback({
      tone: "info",
      message: "Scanner stopped. You can scan again or enter a pass code.",
    });
  }

  async function handleManualSubmit(event: FormEvent) {
    event.preventDefault();
    if (phase === "resolving" || phase === "checkingIn") return;
    const opaque = normalizeScannedQrToken(manualValue);
    setManualValue("");
    if (!opaque) {
      setFeedback({
        tone: "error",
        message: "Enter a valid pass code.",
      });
      return;
    }
    await beginResolve(opaque);
  }

  function handleToggleAttendee(id: string, checked: boolean) {
    if (resolved?.bindingType === "ATTENDEE") return;
    if (
      checked &&
      !selectedIds.includes(id) &&
      selectedIds.length >= STAFF_PARTY_CHECK_IN_MAX_ATTENDEES
    ) {
      setSelectionError(
        `Select at most ${STAFF_PARTY_CHECK_IN_MAX_ATTENDEES} attendees at once.`,
      );
      return;
    }
    setSelectionError(null);
    setSelectedIds((prev) =>
      toggleStaffPartyAttendeeSelection(prev, id, checked),
    );
  }

  async function handleCheckIn() {
    const token = rawTokenRef.current;
    if (!token || !resolved || phase === "checkingIn") return;

    if (resolved.bindingType === "PARTY" && selectedIds.length === 0) {
      setSelectionError("Select at least one attendee to check in.");
      return;
    }

    setPhase("checkingIn");
    setFeedback(null);
    setSelectionError(null);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const result = await submitQrCheckIn({
      eventId,
      token,
      attendeeIds:
        resolved.bindingType === "PARTY" ? selectedIds : undefined,
      stationId: stationIdForCheckInRequest(stationId),
      idempotencyKey: crypto.randomUUID(),
      signal: controller.signal,
    });

    if (!mountedRef.current || controller.signal.aborted) return;

    if (!result.ok) {
      if (isStationClosedCheckInFailure(result)) {
        clearEphemeralQrCheckInToken(rawTokenRef);
        setResolved(null);
        setEligible([]);
        setSelectedIds([]);
        setPhase("idle");
        onStationClosed?.();
        setFeedback({
          tone: "error",
          message: mapQrCheckInFailureMessage(result),
        });
        return;
      }
      // Terminal auth/invalid pass: clear bearer. Recoverable UX still clears token
      // so operators re-scan rather than retaining the secret indefinitely.
      clearEphemeralQrCheckInToken(rawTokenRef);
      setResolved(null);
      setEligible([]);
      setSelectedIds([]);
      setPhase("idle");
      setFeedback({
        tone: "error",
        message: mapQrCheckInFailureMessage(result),
      });
      return;
    }

    clearEphemeralQrCheckInToken(rawTokenRef);
    setResolved(null);
    setEligible([]);
    setSelectedIds([]);
    setPhase("idle");

    if (result.data.kind === "SINGLE") {
      const single = result.data;
      const attendee = eligible.find((row) => row.id === single.attendeeId);
      const name = attendee
        ? `${attendee.lastName}, ${attendee.firstName}`
        : "Attendee";
      setFeedback({
        tone: single.alreadyPresent ? "info" : "success",
        message: singleCheckInSuccessMessage({
          attendeeName: name,
          alreadyPresent: single.alreadyPresent,
          stationName: single.alreadyPresent ? null : stationName,
        }),
      });
      return;
    }

    const party = result.data;
    setFeedback({
      tone:
        party.newlyCheckedInCount === 0 && party.alreadyPresentCount > 0
          ? "info"
          : "success",
      message: partyCheckInSuccessMessage({
        newlyCheckedInCount: party.newlyCheckedInCount,
        alreadyPresentCount: party.alreadyPresentCount,
        requestedCount: party.requestedCount,
        stationName: party.newlyCheckedInCount > 0 ? stationName : null,
      }),
    });
  }

  const busy = phase === "resolving" || phase === "checkingIn";
  const showResolved = phase === "resolved" || phase === "checkingIn";

  return (
    <section
      aria-labelledby={headingId}
      className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <header className="space-y-1">
        <h2
          id={headingId}
          className="text-sm font-semibold text-zinc-800 dark:text-zinc-200"
        >
          QR pass check-in
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Scan or paste a pass, confirm who to check in, then submit. Scanning
          never checks anyone in automatically.
        </p>
      </header>

      {!showResolved ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {cameraSupported && phase !== "scanning" ? (
              <button
                type="button"
                onClick={() => void handleStartCamera()}
                disabled={busy}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                Start camera scan
              </button>
            ) : null}
            {phase === "scanning" ? (
              <button
                type="button"
                onClick={handleStopCamera}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 dark:border-zinc-600 dark:text-zinc-100"
              >
                Stop scanner
              </button>
            ) : null}
            {phase === "idle" &&
            (feedback?.tone === "success" || feedback?.tone === "info") ? (
              <button
                type="button"
                onClick={() => resetSession()}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 dark:border-zinc-600 dark:text-zinc-100"
              >
                Scan another
              </button>
            ) : null}
          </div>

          {phase === "scanning" ? (
            <div className="space-y-2">
              <p className="text-xs text-zinc-500" role="status">
                {cameraState === "pending"
                  ? "Requesting camera…"
                  : cameraState === "granted"
                    ? "Point the camera at a QR pass. One code will be captured."
                    : "Starting camera…"}
              </p>
              <video
                ref={videoRef}
                className="aspect-video w-full max-w-md rounded-md bg-zinc-900 object-cover"
                playsInline
                muted
                autoPlay
                aria-label="QR scanner camera preview"
              />
            </div>
          ) : null}

          {cameraState === "denied" ||
          cameraState === "unavailable" ||
          cameraState === "error" ||
          !cameraSupported ? (
            <p className="text-xs text-zinc-500" role="status">
              Camera scanning is not available right now. Use the pass code
              field.
            </p>
          ) : null}

          <form className="space-y-3" onSubmit={handleManualSubmit} noValidate>
            <div className="space-y-1">
              <label
                htmlFor={manualId}
                className="block text-sm font-medium text-zinc-800 dark:text-zinc-200"
              >
                Enter or paste pass code
              </label>
              <input
                id={manualId}
                name="qr-pass-token"
                type="password"
                value={manualValue}
                onChange={(event) => setManualValue(event.target.value)}
                disabled={busy || phase === "scanning"}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                inputMode="text"
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>
            <button
              type="submit"
              disabled={busy || phase === "scanning" || !manualValue.trim()}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-100"
            >
              {phase === "resolving" ? "Looking up pass…" : "Look up pass"}
            </button>
          </form>
        </div>
      ) : null}

      {showResolved && resolved ? (
        <div className="space-y-4">
          <p className="text-sm text-zinc-700 dark:text-zinc-200" role="status">
            {resolved.bindingType === "PARTY"
              ? "Party pass ready. Select who to check in."
              : "Attendee pass ready. Confirm check-in below."}
            {loadingNames ? " Loading names…" : null}
          </p>

          {resolved.bindingType === "PARTY" ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Select attendees
              </legend>
              <p className="text-xs text-zinc-500">
                {selectedIds.length} selected · maximum{" "}
                {STAFF_PARTY_CHECK_IN_MAX_ATTENDEES}
              </p>
              <ul className="space-y-2">
                {eligible.map((row) => {
                  const checked = selectedIds.includes(row.id);
                  return (
                    <li key={row.id}>
                      <label className="flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-100">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={busy}
                          onChange={(event) =>
                            handleToggleAttendee(row.id, event.target.checked)
                          }
                        />
                        <span>
                          {row.lastName}, {row.firstName}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              {selectionError ? (
                <p
                  id={selectionErrorId}
                  role="alert"
                  className="text-sm text-red-600 dark:text-red-400"
                >
                  {selectionError}
                </p>
              ) : null}
            </fieldset>
          ) : (
            <p className="text-sm text-zinc-700 dark:text-zinc-200">
              {eligible[0]
                ? `${eligible[0].lastName}, ${eligible[0].firstName}`
                : "Bound attendee"}
            </p>
          )}

          <p className="text-xs text-zinc-500">
            Station: {stationName?.trim() ? stationName : "None (optional)"}
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleCheckIn()}
              disabled={busy}
              aria-busy={phase === "checkingIn"}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {phase === "checkingIn"
                ? "Checking in…"
                : resolved.bindingType === "PARTY"
                  ? "Check in selected"
                  : "Check in"}
            </button>
            <button
              type="button"
              onClick={() => resetSession()}
              disabled={busy}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-100"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div
        id={feedbackId}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="min-h-[1.5rem]"
      >
        {feedback ? (
          <p
            className={`rounded-md border px-3 py-2 text-sm ${feedbackClass(feedback.tone)}`}
          >
            {feedback.message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
