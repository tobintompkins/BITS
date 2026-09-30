"use client";

import { useEffect } from "react";

import {
  DISPLAY_PREFERENCES_CHANGE_EVENT,
  DISPLAY_PREFERENCES_STORAGE_KEY,
  applyDisplayRootAttributes,
  readStoredDisplayPreferences,
  serializeDisplayPreferences,
  type DisplayPreferences,
} from "@/lib/accessibility/display-preferences";

function osPrefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function applyStoredDisplayPreferences(
  raw?: string | null,
  osPrefers = osPrefersReducedMotion(),
) {
  const preferences = readStoredDisplayPreferences(
    raw ?? window.localStorage.getItem(DISPLAY_PREFERENCES_STORAGE_KEY),
  );
  applyDisplayRootAttributes(
    document.documentElement,
    preferences,
    osPrefers,
  );
  return preferences;
}

export function persistDisplayPreferences(preferences: DisplayPreferences) {
  window.localStorage.setItem(
    DISPLAY_PREFERENCES_STORAGE_KEY,
    serializeDisplayPreferences(preferences),
  );
  applyStoredDisplayPreferences();
  window.dispatchEvent(new Event(DISPLAY_PREFERENCES_CHANGE_EVENT));
}

export function clearDisplayPreferences() {
  window.localStorage.removeItem(DISPLAY_PREFERENCES_STORAGE_KEY);
  applyStoredDisplayPreferences();
  window.dispatchEvent(new Event(DISPLAY_PREFERENCES_CHANGE_EVENT));
}

export function DisplayPreferencesRoot() {
  useEffect(() => {
    applyStoredDisplayPreferences();

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const refresh = () => applyStoredDisplayPreferences();
    media.addEventListener("change", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener(DISPLAY_PREFERENCES_CHANGE_EVENT, refresh);
    return () => {
      media.removeEventListener("change", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener(DISPLAY_PREFERENCES_CHANGE_EVENT, refresh);
    };
  }, []);

  return null;
}
