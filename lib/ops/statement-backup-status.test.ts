import { describe, expect, it } from "vitest";

import { BackupGuardError } from "./independent-backup-guard";
import {
  assessStatementBackup,
  assessStatementWatch,
  assertStatementWatchCredentials,
  dueStatementBackup,
  missingStatusDrillDay,
  missingStatusDrillLabel,
  redactStatementWatchError,
  resolveStatementWatchInvocation,
  statementStatusBody,
  statementStatusKey,
  type StatementStatusObject,
} from "./statement-backup-status";

const due = new Date("2026-11-24T12:15:00.000Z");
const afterWatch = new Date("2026-11-24T12:45:00.000Z");

function status(now: Date, outcome: "empty" | "unchanged" | "copied" | "failed", counts: Partial<StatementStatusObject> = {}): StatementStatusObject {
  const body = statementStatusBody(
    {
      outcome,
      copied: outcome === "copied" ? 1 : 0,
      renewed: 0,
      unchanged: outcome === "unchanged" ? 1 : 0,
      failed: outcome === "failed" ? 1 : 0,
      pdfsPresent: outcome === "empty" ? 0 : 1,
    },
    now,
  ).toString("utf8");
  return { key: statementStatusKey(now), size: Buffer.byteLength(body), body, ...counts };
}

describe("statement backup status watch", () => {
  it("waits until 12:45 UTC and then checks that same day", () => {
    expect(dueStatementBackup(new Date("2026-11-24T12:44:00.000Z")).dueDay).toBe("2026-11-23");
    expect(dueStatementBackup(afterWatch)).toMatchObject({
      dueDay: "2026-11-24",
      deadlineUtc: "2026-11-24T12:45:00.000Z",
      scheduledUtc: "2026-11-24T12:15:00.000Z",
    });
  });

  it("accepts a successful empty run without treating it as proof of a copy", () => {
    const result = assessStatementBackup({ now: afterWatch, statuses: [status(due, "empty")] });
    expect(result).toMatchObject({
      alert: false,
      reason: "ok",
      dueDay: "2026-11-24",
      outcome: "empty",
      copied: 0,
      renewed: 0,
      unchanged: 0,
      failed: 0,
      emptyRun: true,
      proofOfCopy: false,
      deletes: false,
      notificationSent: false,
    });
  });

  it("detects a missing status record", () => {
    const result = assessStatementBackup({ now: afterWatch, statuses: [] });
    expect(result).toMatchObject({ alert: true, reason: "missing", statusKey: null, emptyRun: false });
  });

  it("detects a stale status record", () => {
    const early = new Date("2026-11-24T12:14:59.000Z");
    const result = assessStatementBackup({ now: afterWatch, statuses: [status(early, "empty")] });
    expect(result).toMatchObject({ alert: true, reason: "stale", outcome: "empty" });
  });

  it("detects a malformed status record and does not echo its contents", () => {
    const key = statementStatusKey(due);
    const donorBody = JSON.stringify({
      version: 1,
      kind: "statement-backup-status",
      day: "2026-11-24",
      completedAt: due.toISOString(),
      outcome: "empty",
      copied: 0,
      renewed: 0,
      unchanged: 0,
      failed: 0,
      pdfsPresent: 0,
      donor: "not-allowed",
    });
    const malformed = assessStatementBackup({
      now: afterWatch,
      statuses: [{ key, size: Buffer.byteLength(donorBody), body: donorBody }],
    });
    const broken = assessStatementBackup({
      now: afterWatch,
      statuses: [{ key, size: 4, body: "nope" }],
    });
    expect(malformed).toMatchObject({ alert: true, reason: "malformed", outcome: null });
    expect(broken.reason).toBe("malformed");
    expect(JSON.stringify(malformed)).not.toContain("not-allowed");
    expect(JSON.stringify(broken)).not.toContain("nope");
  });

  it("detects a failed status record", () => {
    const result = assessStatementBackup({ now: afterWatch, statuses: [status(due, "failed")] });
    expect(result).toMatchObject({ alert: true, reason: "failed", failed: 1, proofOfCopy: false });
  });

  it("uses the newest status and stays quiet before the deadline", () => {
    const newest = assessStatementBackup({
      now: afterWatch,
      statuses: [status(new Date("2026-11-24T12:14:00.000Z"), "failed"), status(due, "unchanged")],
    });
    const waiting = assessStatementBackup({
      now: new Date("2026-11-24T12:20:00.000Z"),
      day: "2026-11-24",
      statuses: [],
    });
    expect(newest).toMatchObject({ alert: false, reason: "ok", outcome: "unchanged" });
    expect(waiting).toMatchObject({ alert: false, reason: "pending" });
  });

  it("fails the manual drill without reading stored statuses", () => {
    const invocation = resolveStatementWatchInvocation(["--drill=missing-status"], {
      eventName: "workflow_dispatch",
    });
    const report = assessStatementWatch({ invocation, statuses: [status(due, "copied")] });
    expect(report).toMatchObject({
      alert: true,
      reason: "missing",
      dueDay: missingStatusDrillDay,
      drill: "missing-status",
      injectedEmpty: true,
      label: missingStatusDrillLabel,
      deletes: false,
      notificationSent: false,
    });
  });

  it("rejects a scheduled drill, a write, and a private key", () => {
    expect(() =>
      resolveStatementWatchInvocation(["--drill=missing-status"], { eventName: "schedule" }),
    ).toThrow("cannot run from the schedule");
    expect(() => resolveStatementWatchInvocation(["--apply"])).toThrow("read-only");
    expect(() => resolveStatementWatchInvocation(["--delete"])).toThrow("read-only");
    expect(() =>
      assertStatementWatchCredentials({
        BITS_BACKUP_R2_BUCKET: "bits-independent-backups",
        BITS_BACKUP_R2_ENDPOINT: "https://example.r2.cloudflarestorage.com",
        BITS_BACKUP_R2_ACCESS_KEY_ID: "EXAMPLEACCESSKEY",
        BITS_BACKUP_R2_SECRET_ACCESS_KEY: "EXAMPLESECRETKEY",
        AGE_SECRET_KEY: "present",
      }),
    ).toThrow(BackupGuardError);
    const redacted = redactStatementWatchError(new Error("denied for EXAMPLESECRETKEY"), ["EXAMPLESECRETKEY"]);
    expect(redacted).not.toContain("EXAMPLESECRETKEY");
  });
});
