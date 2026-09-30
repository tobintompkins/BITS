import { describe, expect, it } from "vitest";

import {
  DEFAULT_DISPLAY_PREFERENCES,
  DISPLAY_PREFERENCES_ALLOWED_KEYS,
  DISPLAY_PREFERENCES_BOOT_SCRIPT,
  DISPLAY_PREFERENCES_STORAGE_KEY,
  applyDisplayRootAttributes,
  displayRootAttributes,
  parseDisplayPreferences,
  readStoredDisplayPreferences,
  resetDisplayPreferences,
  serializeDisplayPreferences,
  shouldReduceMotion,
  updateDisplayPreferences,
} from "./display-preferences";

describe("display preference defaults", () => {
  it("starts at standard text size and standard motion", () => {
    expect(DEFAULT_DISPLAY_PREFERENCES).toEqual({
      textSize: "standard",
      motion: "standard",
    });
    expect(resetDisplayPreferences()).toEqual(DEFAULT_DISPLAY_PREFERENCES);
    expect(readStoredDisplayPreferences(null)).toEqual(
      DEFAULT_DISPLAY_PREFERENCES,
    );
    expect(readStoredDisplayPreferences("")).toEqual(
      DEFAULT_DISPLAY_PREFERENCES,
    );
  });
});

describe("stored display preference values", () => {
  it("accepts valid stored JSON and rejects invalid values", () => {
    expect(
      readStoredDisplayPreferences(
        '{"textSize":"large","motion":"reduce","email":"member@church.test","token":"secret"}',
      ),
    ).toEqual({ textSize: "large", motion: "reduce" });
    expect(
      readStoredDisplayPreferences(
        '{"textSize":"extra-large","motion":"standard"}',
      ),
    ).toEqual({ textSize: "extra-large", motion: "standard" });
    expect(readStoredDisplayPreferences("{not json")).toEqual(
      DEFAULT_DISPLAY_PREFERENCES,
    );
    expect(
      readStoredDisplayPreferences('{"textSize":"huge","motion":"fast"}'),
    ).toEqual(DEFAULT_DISPLAY_PREFERENCES);
    expect(parseDisplayPreferences(["large"])).toEqual(
      DEFAULT_DISPLAY_PREFERENCES,
    );
    expect(parseDisplayPreferences(null)).toEqual(DEFAULT_DISPLAY_PREFERENCES);
  });

  it("keeps text-size and motion independent", () => {
    const larger = updateDisplayPreferences(DEFAULT_DISPLAY_PREFERENCES, {
      textSize: "large",
    });
    expect(larger).toEqual({ textSize: "large", motion: "standard" });

    const reduced = updateDisplayPreferences(larger, { motion: "reduce" });
    expect(reduced).toEqual({ textSize: "large", motion: "reduce" });

    const extra = updateDisplayPreferences(reduced, {
      textSize: "extra-large",
    });
    expect(extra).toEqual({ textSize: "extra-large", motion: "reduce" });
  });
});

describe("display preference reset and storage", () => {
  it("restores defaults and serializes only non-sensitive visual keys", () => {
    const stored = serializeDisplayPreferences({
      textSize: "extra-large",
      motion: "reduce",
      email: "member@church.test",
      token: "secret-token",
      memberId: "mem_123",
      organizationId: "org_123",
    } as never);
    const parsed = JSON.parse(stored) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(
      [...DISPLAY_PREFERENCES_ALLOWED_KEYS].sort(),
    );
    expect(stored).not.toContain("member@church.test");
    expect(stored).not.toContain("secret-token");
    expect(stored).not.toContain("mem_123");
    expect(stored).not.toContain("org_123");
    expect(DISPLAY_PREFERENCES_STORAGE_KEY).toBe("bits.display-preferences");
    expect(DISPLAY_PREFERENCES_BOOT_SCRIPT).toContain(
      DISPLAY_PREFERENCES_STORAGE_KEY,
    );
    expect(DISPLAY_PREFERENCES_BOOT_SCRIPT).not.toMatch(
      /password|secret|token|clerk|memberId|stripe/i,
    );
    expect(resetDisplayPreferences()).toEqual(DEFAULT_DISPLAY_PREFERENCES);
  });
});

describe("reduced-motion helper", () => {
  it("uses Reduce Motion or the OS preference as a baseline", () => {
    expect(shouldReduceMotion("standard", false)).toBe(false);
    expect(shouldReduceMotion("standard", true)).toBe(true);
    expect(shouldReduceMotion("reduce", false)).toBe(true);
    expect(shouldReduceMotion("reduce", true)).toBe(true);
  });

  it("maps preferences to root attributes without private data", () => {
    expect(
      displayRootAttributes(
        { textSize: "large", motion: "standard" },
        false,
      ),
    ).toEqual({
      "data-bits-text-size": "large",
      "data-bits-reduce-motion": "false",
    });
    expect(
      displayRootAttributes(
        { textSize: "standard", motion: "standard" },
        true,
      ),
    ).toEqual({
      "data-bits-text-size": "standard",
      "data-bits-reduce-motion": "true",
    });

    const attrs: Record<string, string> = {};
    applyDisplayRootAttributes(
      {
        setAttribute(name, value) {
          attrs[name] = value;
        },
      },
      { textSize: "extra-large", motion: "reduce" },
      false,
    );
    expect(attrs).toEqual({
      "data-bits-text-size": "extra-large",
      "data-bits-reduce-motion": "true",
    });
    expect(JSON.stringify(attrs)).not.toMatch(/email|token|member/i);
  });
});
