import { describe, expect, it } from "vitest";

import {
  resolveStatementPdfWriteConfig,
  statementStorageDiagnostics,
} from "./statement-pdf-config";

describe("statement PDF write configuration", () => {
  it("defaults to local outside production", () => {
    expect(resolveStatementPdfWriteConfig({}, "test")).toEqual({
      ok: true,
      backend: "local",
    });
  });

  it("rejects production local writes unless explicitly allowed", () => {
    const blocked = resolveStatementPdfWriteConfig({}, "production");
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe("MISSING_DURABLE_CONFIG");
    expect(
      resolveStatementPdfWriteConfig(
        { BITS_STATEMENT_ALLOW_LOCAL_PRODUCTION: "1" },
        "production",
      ),
    ).toEqual({ ok: true, backend: "local" });
  });

  it("requires a bucket, region and HTTPS endpoint for S3 writes", () => {
    expect(
      resolveStatementPdfWriteConfig(
        { BITS_STATEMENT_PDF_BACKEND: "s3" },
        "test",
      ).ok,
    ).toBe(false);
    const insecure = resolveStatementPdfWriteConfig(
      {
        BITS_STATEMENT_PDF_BACKEND: "s3",
        BITS_STATEMENT_S3_BUCKET: "bits-statements",
        BITS_STATEMENT_S3_REGION: "us-east-1",
        BITS_STATEMENT_S3_ENDPOINT: "http://localhost:9000",
      },
      "test",
    );
    expect(insecure.ok).toBe(false);
    const ok = resolveStatementPdfWriteConfig(
      {
        BITS_STATEMENT_PDF_BACKEND: "s3",
        BITS_STATEMENT_S3_BUCKET: "bits-statements",
        BITS_STATEMENT_S3_REGION: "us-east-1",
        BITS_STATEMENT_S3_ENDPOINT: "https://s3.example.test",
      },
      "test",
    );
    expect(ok).toMatchObject({ ok: true, backend: "s3", bucket: "bits-statements" });
  });

  it("reports readiness without exposing secrets", () => {
    const report = statementStorageDiagnostics({
      BITS_STATEMENT_PDF_BACKEND: "s3",
      BITS_STATEMENT_S3_BUCKET: "bits-statements",
      BITS_STATEMENT_S3_REGION: "us-east-1",
      AWS_SECRET_ACCESS_KEY: "super-secret",
    });
    expect(report.ready).toBe(true);
    expect(JSON.stringify(report)).not.toContain("super-secret");
  });
});
