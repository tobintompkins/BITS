"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import {
  DISPLAY_MOTION_LABELS,
  DISPLAY_MOTION_PREFERENCES,
  DISPLAY_PREFERENCES_CHANGE_EVENT,
  DISPLAY_PREFERENCES_STORAGE_KEY,
  DISPLAY_TEXT_SIZE_LABELS,
  DISPLAY_TEXT_SIZES,
  readStoredDisplayPreferences,
  resetDisplayPreferences,
  type DisplayMotionPreference,
  type DisplayPreferences,
  type DisplayTextSize,
  updateDisplayPreferences,
} from "@/lib/accessibility/display-preferences";

import {
  clearDisplayPreferences,
  persistDisplayPreferences,
} from "./display-preferences-root";

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

function subscribeToDisplayPreferences(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(DISPLAY_PREFERENCES_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(DISPLAY_PREFERENCES_CHANGE_EVENT, onStoreChange);
  };
}

function getDisplayPreferencesSnapshot() {
  return window.localStorage.getItem(DISPLAY_PREFERENCES_STORAGE_KEY);
}

function getDisplayPreferencesServerSnapshot() {
  return null;
}

export function DisplayOptions() {
  const raw = useSyncExternalStore(
    subscribeToDisplayPreferences,
    getDisplayPreferencesSnapshot,
    getDisplayPreferencesServerSnapshot,
  );
  const preferences = readStoredDisplayPreferences(raw);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const dialogId = useId();
  const textSizeName = useId();
  const motionName = useId();

  useEffect(() => {
    if (!open) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const closeOnPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("mousedown", closeOnPointer);
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("mousedown", closeOnPointer);
    };
  }, [open]);

  function save(next: DisplayPreferences) {
    persistDisplayPreferences(next);
  }

  function chooseTextSize(textSize: DisplayTextSize) {
    save(updateDisplayPreferences(preferences, { textSize }));
  }

  function chooseMotion(motion: DisplayMotionPreference) {
    save(updateDisplayPreferences(preferences, { motion }));
  }

  function reset() {
    resetDisplayPreferences();
    clearDisplayPreferences();
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={dialogId}
        aria-haspopup="dialog"
        aria-label="Display options"
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex items-center rounded-xl border px-2.5 py-2 text-sm font-semibold ${focusClass} ${
          open
            ? "border-[var(--bits-gold)] bg-[var(--bits-gold)] text-[var(--bits-navy-deep)]"
            : "border-white/30 bg-white/10 text-white hover:bg-white hover:text-[var(--bits-navy)]"
        }`}
      >
        <span aria-hidden="true" className="sm:hidden">
          Aa
        </span>
        <span className="hidden sm:inline">Display</span>
      </button>
      <div
        ref={dialogRef}
        id={dialogId}
        hidden={!open}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="absolute right-0 z-50 mt-3 w-[min(18.5rem,calc(100vw-1.5rem))] rounded-2xl border border-[var(--bits-border)] bg-white p-4 text-[var(--bits-navy)] shadow-xl"
      >
        <h2
          id={titleId}
          className="text-sm font-semibold text-[var(--bits-navy)]"
        >
          Display settings
        </h2>
        <p className="mt-1 text-xs leading-5 text-[var(--bits-muted)]">
          These choices stay on this device and do not change church records.
        </p>

        <fieldset className="mt-4">
          <legend className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--bits-navy)]">
            Text Size
          </legend>
          <div className="mt-2 grid gap-2">
            {DISPLAY_TEXT_SIZES.map((size) => {
              const selected = preferences.textSize === size;
              return (
                <label
                  key={size}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${focusClass} ${
                    selected
                      ? "border-[var(--bits-gold)] bg-[var(--bits-page)] font-semibold"
                      : "border-[var(--bits-border)]"
                  }`}
                >
                  <input
                    type="radio"
                    name={textSizeName}
                    value={size}
                    checked={selected}
                    onChange={() => chooseTextSize(size)}
                    className={focusClass}
                  />
                  <span>{DISPLAY_TEXT_SIZE_LABELS[size]}</span>
                  {selected ? (
                    <span className="ml-auto text-xs text-[var(--bits-muted)]">
                      Selected
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="mt-4">
          <legend className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--bits-navy)]">
            Motion
          </legend>
          <div className="mt-2 grid gap-2">
            {DISPLAY_MOTION_PREFERENCES.map((motion) => {
              const selected = preferences.motion === motion;
              return (
                <label
                  key={motion}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${focusClass} ${
                    selected
                      ? "border-[var(--bits-gold)] bg-[var(--bits-page)] font-semibold"
                      : "border-[var(--bits-border)]"
                  }`}
                >
                  <input
                    type="radio"
                    name={motionName}
                    value={motion}
                    checked={selected}
                    onChange={() => chooseMotion(motion)}
                    className={focusClass}
                  />
                  <span>{DISPLAY_MOTION_LABELS[motion]}</span>
                  {selected ? (
                    <span className="ml-auto text-xs text-[var(--bits-muted)]">
                      Selected
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>
        </fieldset>

        <button
          type="button"
          onClick={reset}
          className={`mt-4 w-full rounded-xl border border-[var(--bits-border)] px-3 py-2 text-sm font-semibold text-[var(--bits-navy)] hover:bg-[var(--bits-page)] ${focusClass}`}
        >
          Reset Display Settings
        </button>
      </div>
    </div>
  );
}
