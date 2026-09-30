"use client";

import { useClerk } from "@clerk/nextjs";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type SyntheticEvent,
} from "react";

import {
  resolveStaffIdleTimeoutConfig,
  staffIdleMinutesToMs,
} from "@/lib/security/staff-idle-timeout";

const ACTIVITY_THROTTLE_MS = 1000;
const COUNTDOWN_TICK_MS = 250;
const DIALOG_FOCUS_GRACE_MS = 400;
const SIGN_IN_PATH = "/sign-in";
const SIGN_OUT_ERROR =
  "Sign-out could not be completed. Please try Sign Out Now again.";

type StaffIdleTimeoutProps = {
  timeoutMinutes: number;
  warningMinutes: number;
};

function formatRemaining(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const minuteLabel =
    minutes === 1 ? "1 minute" : minutes > 0 ? `${minutes} minutes` : null;
  const secondLabel = seconds === 1 ? "1 second" : `${seconds} seconds`;
  if (!minuteLabel) return secondLabel;
  if (seconds === 0) return minuteLabel;
  return `${minuteLabel} ${secondLabel}`;
}

export function StaffIdleTimeout({
  timeoutMinutes,
  warningMinutes,
}: StaffIdleTimeoutProps) {
  const { signOut } = useClerk();
  const config = resolveStaffIdleTimeoutConfig({
    timeoutMinutes: String(timeoutMinutes),
    warningMinutes: String(warningMinutes),
  });
  const timeoutMs = staffIdleMinutesToMs(config.timeoutMinutes);
  const warningMs = staffIdleMinutesToMs(config.warningMinutes);
  const warningDelayMs = staffIdleMinutesToMs(config.warningStartsAfterMinutes);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const staySignedInButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  const [warningOpen, setWarningOpen] = useState(false);
  const [remainingMs, setRemainingMs] = useState(warningMs);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const lastActivityRef = useRef(0);
  const lastResetAtRef = useRef(0);
  const ignoreActivityUntilRef = useRef(0);
  const warningOpenRef = useRef(false);
  const signingOutRef = useRef(false);
  const warningTimerRef = useRef<number | null>(null);
  const signOutTimerRef = useRef<number | null>(null);
  const signOutFnRef = useRef(signOut);
  const performSignOutRef = useRef<() => Promise<void>>(async () => {});
  const staySignedInRef = useRef<() => void>(() => {});

  const clearIdleTimers = useCallback(() => {
    if (warningTimerRef.current != null) {
      window.clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }
    if (signOutTimerRef.current != null) {
      window.clearTimeout(signOutTimerRef.current);
      signOutTimerRef.current = null;
    }
  }, []);

  const performSignOut = useCallback(async () => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    warningOpenRef.current = true;
    setSigningOut(true);
    setSignOutError(null);
    setWarningOpen(true);
    try {
      await signOutFnRef.current({ redirectUrl: SIGN_IN_PATH });
      window.location.assign(SIGN_IN_PATH);
    } catch {
      signingOutRef.current = false;
      setSigningOut(false);
      setSignOutError(SIGN_OUT_ERROR);
    }
  }, []);

  const armTimers = useCallback(() => {
    clearIdleTimers();
    lastActivityRef.current = Date.now();
    warningTimerRef.current = window.setTimeout(() => {
      warningOpenRef.current = true;
      setRemainingMs(warningMs);
      setWarningOpen(true);
    }, warningDelayMs);
    signOutTimerRef.current = window.setTimeout(() => {
      void performSignOutRef.current();
    }, timeoutMs);
  }, [clearIdleTimers, timeoutMs, warningDelayMs, warningMs]);

  const staySignedIn = useCallback(() => {
    if (signingOutRef.current) return;
    lastResetAtRef.current = Date.now();
    warningOpenRef.current = false;
    setWarningOpen(false);
    setSignOutError(null);
    setRemainingMs(warningMs);
    armTimers();
  }, [armTimers, warningMs]);

  useEffect(() => {
    signOutFnRef.current = signOut;
  }, [signOut]);

  useEffect(() => {
    performSignOutRef.current = performSignOut;
  }, [performSignOut]);

  useEffect(() => {
    staySignedInRef.current = staySignedIn;
  }, [staySignedIn]);

  useEffect(() => {
    armTimers();
    return () => {
      clearIdleTimers();
    };
  }, [armTimers, clearIdleTimers]);

  useEffect(() => {
    const onActivity = (event: Event) => {
      if (signingOutRef.current) return;
      if (Date.now() < ignoreActivityUntilRef.current) return;

      const dialog = dialogRef.current;
      if (
        dialog?.open &&
        event.target instanceof Node &&
        dialog.contains(event.target)
      ) {
        return;
      }

      const now = Date.now();
      if (
        !warningOpenRef.current &&
        now - lastResetAtRef.current < ACTIVITY_THROTTLE_MS
      ) {
        return;
      }

      staySignedInRef.current();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        onActivity(new Event("focus"));
      }
    };

    const listenerOptions: AddEventListenerOptions = { capture: true };
    const passiveOptions: AddEventListenerOptions = {
      capture: true,
      passive: true,
    };

    window.addEventListener("pointerdown", onActivity, listenerOptions);
    window.addEventListener("mousemove", onActivity, listenerOptions);
    window.addEventListener("keydown", onActivity, listenerOptions);
    window.addEventListener("touchstart", onActivity, passiveOptions);
    window.addEventListener("scroll", onActivity, passiveOptions);
    window.addEventListener("focus", onActivity);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("pointerdown", onActivity, listenerOptions);
      window.removeEventListener("mousemove", onActivity, listenerOptions);
      window.removeEventListener("keydown", onActivity, listenerOptions);
      window.removeEventListener("touchstart", onActivity, passiveOptions);
      window.removeEventListener("scroll", onActivity, passiveOptions);
      window.removeEventListener("focus", onActivity);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (warningOpen) {
      ignoreActivityUntilRef.current = Date.now() + DIALOG_FOCUS_GRACE_MS;
      if (!dialog.open) dialog.showModal();
      staySignedInButtonRef.current?.focus();
      return;
    }
    if (dialog.open) dialog.close();
  }, [warningOpen]);

  useEffect(() => {
    if (!warningOpen) return;
    const tick = () => {
      setRemainingMs(
        Math.max(0, lastActivityRef.current + timeoutMs - Date.now()),
      );
    };
    tick();
    const intervalId = window.setInterval(tick, COUNTDOWN_TICK_MS);
    return () => window.clearInterval(intervalId);
  }, [timeoutMs, warningOpen]);

  function onDialogCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    staySignedIn();
  }

  function onDialogClose() {
    if (signingOutRef.current) return;
    if (warningOpenRef.current) {
      ignoreActivityUntilRef.current = Date.now() + DIALOG_FOCUS_GRACE_MS;
      dialogRef.current?.showModal();
      staySignedInButtonRef.current?.focus();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-modal="true"
      onCancel={onDialogCancel}
      onClose={onDialogClose}
      className="w-[min(32rem,calc(100vw-2rem))] max-w-full rounded-2xl border-2 border-[var(--bits-gold)] bg-[var(--bits-navy)] p-0 text-white shadow-2xl [&::backdrop]:bg-black/65"
    >
      <div className="border-b border-[var(--bits-gold)] px-5 py-4">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--bits-gold)]">
          Shared computer safety
        </p>
        <h2 id={titleId} className="mt-1 text-lg font-semibold text-white">
          Still there?
        </h2>
      </div>
      <div className="px-5 py-4">
        <p id={descriptionId} className="text-sm leading-6 text-white/90">
          This Leadership Portal session will sign out soon to protect church
          records on a shared computer.
        </p>
        <p className="mt-3 text-sm font-semibold text-white" aria-live="polite">
          You will be signed out in {formatRemaining(remainingMs)}.
        </p>
        {signOutError ? (
          <p role="alert" className="mt-3 text-sm text-[#ffd9d9]">
            {signOutError}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col-reverse gap-3 px-5 py-4 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={() => void performSignOut()}
          disabled={signingOut}
          className="min-h-11 rounded-xl border border-white/80 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {signingOut ? "Signing out..." : "Sign Out Now"}
        </button>
        <button
          ref={staySignedInButtonRef}
          type="button"
          onClick={staySignedIn}
          disabled={signingOut}
          className="min-h-11 rounded-xl bg-[var(--bits-gold)] px-4 py-2.5 text-sm font-semibold text-[var(--bits-navy)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Stay Signed In
        </button>
      </div>
    </dialog>
  );
}
