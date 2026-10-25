import { describe, expect, it, vi } from "vitest";

import {
  runWithObservedLockContention,
  type GivingHouseholdLockObserver,
} from "./giving-household-lock-contention";

const observer: GivingHouseholdLockObserver = {
  $queryRaw: async <T>() => [{ blocked: false }] as T,
};

describe("giving household lock-contention harness cleanup", () => {
  it("cleans up when the first writer fails before locks", async () => {
    const second = vi.fn(async () => "second");
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    try {
      await expect(
        runWithObservedLockContention(
          observer,
          async () => {
            throw new Error("first-writer authorization failed");
          },
          second,
          { lockWaitMs: 80 },
        ),
      ).rejects.toThrow(/first-writer authorization failed/);
      await new Promise((resolve) => setTimeout(resolve, 120));
      expect(second).not.toHaveBeenCalled();
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("cleans up when the first writer finishes without the after-locks hook", async () => {
    const second = vi.fn(async () => "second");
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    try {
      await expect(
        runWithObservedLockContention(
          observer,
          async () => "done without locks",
          second,
          { lockWaitMs: 80 },
        ),
      ).rejects.toThrow(/finished before after-locks hook/);
      await new Promise((resolve) => setTimeout(resolve, 120));
      expect(second).not.toHaveBeenCalled();
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
