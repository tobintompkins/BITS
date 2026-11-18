import { describe, expect, it, vi } from "vitest";

import {
  BackupGuardError,
  assertAgeRecipient,
  assertUploadAllowed,
  backupLimits,
  withBackupTimeout,
  withBoundedRetries,
} from "./independent-backup-guard";

const mib = 1024 * 1024;
const gib = 1024 * mib;

describe("independent backup guards", () => {
  it("allows the current TEST archive and refuses anything over the size bounds", () => {
    expect(() =>
      assertUploadAllowed({
        kind: "postgres",
        archiveBytes: 384_921,
        existingBucketBytes: 0,
        incomingBytes: 384_921,
      }),
    ).not.toThrow();
    expect(() =>
      assertUploadAllowed({
        kind: "postgres",
        archiveBytes: 100 * mib,
        existingBucketBytes: 0,
        incomingBytes: 100 * mib,
      }),
    ).not.toThrow();
    expect(() =>
      assertUploadAllowed({
        kind: "postgres",
        archiveBytes: 100 * mib + 1,
        existingBucketBytes: 0,
        incomingBytes: 100 * mib + 1,
      }),
    ).toThrow(/100 MiB/);
    expect(() =>
      assertUploadAllowed({
        kind: "statements",
        statementObjects: 1000,
        statementBytes: gib,
        existingBucketBytes: 0,
        incomingBytes: gib,
      }),
    ).not.toThrow();
    expect(() =>
      assertUploadAllowed({
        kind: "statements",
        statementObjects: 1001,
        statementBytes: 1,
        existingBucketBytes: 0,
        incomingBytes: 1,
      }),
    ).toThrow(/1,000 objects/);
    expect(() =>
      assertUploadAllowed({
        kind: "statements",
        statementObjects: 1,
        statementBytes: gib + 1,
        existingBucketBytes: 0,
        incomingBytes: gib + 1,
      }),
    ).toThrow(/1 GiB/);
  });

  it("stops before an upload that would pass 8 GiB stored", () => {
    expect(() =>
      assertUploadAllowed({
        kind: "postgres",
        archiveBytes: 1,
        existingBucketBytes: 8 * gib - 1,
        incomingBytes: 1,
      }),
    ).not.toThrow();
    expect(() =>
      assertUploadAllowed({
        kind: "postgres",
        archiveBytes: 1,
        existingBucketBytes: 8 * gib,
        incomingBytes: 1,
      }),
    ).toThrow(/8 GiB/);
  });

  it("retries twice with the documented waits and does not try a fourth time", async () => {
    const delays: number[] = [];
    let calls = 0;
    await expect(
      withBoundedRetries(
        async () => {
          calls += 1;
          throw new Error("upload failed");
        },
        {
          sleep: async (delayMs) => {
            delays.push(delayMs);
          },
        },
      ),
    ).rejects.toThrow(/upload failed/);
    expect(calls).toBe(backupLimits.maxAttempts);
    expect(delays).toEqual([...backupLimits.retryDelaysMs]);

    calls = 0;
    const result = await withBoundedRetries(
      async () => {
        calls += 1;
        if (calls < 2) throw new Error("try again");
        return "stored";
      },
      {
        sleep: async (delayMs) => {
          delays.push(delayMs);
        },
      },
    );
    expect(result).toBe("stored");
    expect(calls).toBe(2);
  });

  it("uses a 120 second default timeout and aborts a hung operation", async () => {
    expect(backupLimits.timeoutMs).toBe(120_000);
    vi.useFakeTimers();
    let aborted = false;
    const pending = withBackupTimeout(
      (signal) =>
        new Promise(() => {
          signal.addEventListener("abort", () => {
            aborted = true;
          });
        }),
      { timeoutMs: 120_000 },
    );
    const rejected = expect(pending).rejects.toBeInstanceOf(BackupGuardError);
    await vi.advanceTimersByTimeAsync(120_000);
    await rejected;
    expect(aborted).toBe(true);
    vi.useRealTimers();
  });

  it("does not start another attempt after the timeout aborts", async () => {
    const controller = new AbortController();
    let calls = 0;
    await expect(
      withBoundedRetries(
        async () => {
          calls += 1;
          controller.abort();
          throw new Error("still running");
        },
        {
          signal: controller.signal,
          sleep: async () => {
            throw new Error("should not sleep");
          },
        },
      ),
    ).rejects.toThrow(/still running/);
    expect(calls).toBe(1);
  });

  it("accepts only an age public recipient", () => {
    expect(assertAgeRecipient("age1qqqqqqqqqqqqqqqqqqqq")).toBe("age1qqqqqqqqqqqqqqqqqqqq");
    expect(() => assertAgeRecipient("AGE-SECRET-KEY-1EXAMPLE")).toThrow(/public key/);
    expect(() => assertAgeRecipient("")).toThrow(/required/);
  });
});
