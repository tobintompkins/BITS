export const DISPLAY_TEXT_SIZES = ["standard", "large", "extra-large"] as const;
export type DisplayTextSize = (typeof DISPLAY_TEXT_SIZES)[number];

export const DISPLAY_MOTION_PREFERENCES = ["standard", "reduce"] as const;
export type DisplayMotionPreference =
  (typeof DISPLAY_MOTION_PREFERENCES)[number];

export const DISPLAY_PREFERENCES_STORAGE_KEY = "bits.display-preferences";
export const DISPLAY_PREFERENCES_CHANGE_EVENT = "bits:display-preferences";

export const DISPLAY_TEXT_SIZE_LABELS: Record<DisplayTextSize, string> = {
  standard: "Standard",
  large: "Large",
  "extra-large": "Extra Large",
};

export const DISPLAY_MOTION_LABELS: Record<DisplayMotionPreference, string> = {
  standard: "Standard Motion",
  reduce: "Reduce Motion",
};

export const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = {
  textSize: "standard",
  motion: "standard",
};

export const DISPLAY_PREFERENCES_ALLOWED_KEYS = ["textSize", "motion"] as const;

export type DisplayPreferences = {
  textSize: DisplayTextSize;
  motion: DisplayMotionPreference;
};

export type DisplayRootAttributes = {
  "data-bits-text-size": DisplayTextSize;
  "data-bits-reduce-motion": "true" | "false";
};

function isDisplayTextSize(value: unknown): value is DisplayTextSize {
  return DISPLAY_TEXT_SIZES.includes(value as DisplayTextSize);
}

function isDisplayMotionPreference(
  value: unknown,
): value is DisplayMotionPreference {
  return DISPLAY_MOTION_PREFERENCES.includes(value as DisplayMotionPreference);
}

export function parseDisplayPreferences(value: unknown): DisplayPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_DISPLAY_PREFERENCES };
  }

  const record = value as Record<string, unknown>;
  return {
    textSize: isDisplayTextSize(record.textSize)
      ? record.textSize
      : DEFAULT_DISPLAY_PREFERENCES.textSize,
    motion: isDisplayMotionPreference(record.motion)
      ? record.motion
      : DEFAULT_DISPLAY_PREFERENCES.motion,
  };
}

export function serializeDisplayPreferences(
  preferences: DisplayPreferences,
): string {
  const clean = parseDisplayPreferences(preferences);
  return JSON.stringify({
    textSize: clean.textSize,
    motion: clean.motion,
  });
}

export function readStoredDisplayPreferences(
  raw: string | null | undefined,
): DisplayPreferences {
  if (typeof raw !== "string" || !raw.trim()) {
    return { ...DEFAULT_DISPLAY_PREFERENCES };
  }

  try {
    return parseDisplayPreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_DISPLAY_PREFERENCES };
  }
}

export function updateDisplayPreferences(
  current: DisplayPreferences,
  patch: Partial<DisplayPreferences>,
): DisplayPreferences {
  return parseDisplayPreferences({ ...current, ...patch });
}

export function resetDisplayPreferences(): DisplayPreferences {
  return { ...DEFAULT_DISPLAY_PREFERENCES };
}

export function shouldReduceMotion(
  motion: DisplayMotionPreference,
  osPrefersReducedMotion: boolean,
): boolean {
  return motion === "reduce" || osPrefersReducedMotion;
}

export function displayRootAttributes(
  preferences: DisplayPreferences,
  osPrefersReducedMotion: boolean,
): DisplayRootAttributes {
  const clean = parseDisplayPreferences(preferences);
  return {
    "data-bits-text-size": clean.textSize,
    "data-bits-reduce-motion": shouldReduceMotion(
      clean.motion,
      osPrefersReducedMotion,
    )
      ? "true"
      : "false",
  };
}

export function applyDisplayRootAttributes(
  target: { setAttribute: (name: string, value: string) => void },
  preferences: DisplayPreferences,
  osPrefersReducedMotion: boolean,
) {
  const attributes = displayRootAttributes(
    preferences,
    osPrefersReducedMotion,
  );
  target.setAttribute("data-bits-text-size", attributes["data-bits-text-size"]);
  target.setAttribute(
    "data-bits-reduce-motion",
    attributes["data-bits-reduce-motion"],
  );
}

export const DISPLAY_PREFERENCES_BOOT_SCRIPT = `(function(){try{var raw=localStorage.getItem(${JSON.stringify(
  DISPLAY_PREFERENCES_STORAGE_KEY,
)});var parsed=null;if(raw){try{parsed=JSON.parse(raw);}catch(e){parsed=null;}}var text=${JSON.stringify(
  DEFAULT_DISPLAY_PREFERENCES.textSize,
)};var motion=${JSON.stringify(
  DEFAULT_DISPLAY_PREFERENCES.motion,
)};if(parsed&&(parsed.textSize==="standard"||parsed.textSize==="large"||parsed.textSize==="extra-large")){text=parsed.textSize;}if(parsed&&(parsed.motion==="standard"||parsed.motion==="reduce")){motion=parsed.motion;}var reduce=motion==="reduce"||(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches);var el=document.documentElement;el.setAttribute("data-bits-text-size",text);el.setAttribute("data-bits-reduce-motion",reduce?"true":"false");}catch(e){}})();`;
