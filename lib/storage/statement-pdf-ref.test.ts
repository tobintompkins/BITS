import { describe, expect, it } from "vitest";

import {
  buildStatementPdfStorageRef,
  parseStatementPdfStorageRef,
} from "./statement-pdf-ref";

const ORG = "00000000-0000-4000-8000-00000000a001";
const STMT = "00000000-0000-4000-8000-00000000b001";
const LOCAL = `private/statements/${ORG}/${STMT}/statement.pdf`;

describe("statement PDF storage references", () => {
  it("keeps unprefixed local keys as local even when a remote format exists", () => {
    expect(parseStatementPdfStorageRef(LOCAL, ORG, STMT)).toEqual({
      ok: true,
      backend: "local",
      objectKey: LOCAL,
      storageKey: LOCAL,
    });
    expect(buildStatementPdfStorageRef("s3", ORG, STMT, "statement.pdf")).toBe(
      `s3v1:${LOCAL}`,
    );
  });

  it("parses versioned remote references and rejects URLs or unknown versions", () => {
    expect(parseStatementPdfStorageRef(`s3v1:${LOCAL}`, ORG, STMT)).toEqual({
      ok: true,
      backend: "s3",
      objectKey: LOCAL,
      storageKey: `s3v1:${LOCAL}`,
    });
    expect(
      parseStatementPdfStorageRef(`https://bucket/${LOCAL}`, ORG, STMT).ok,
    ).toBe(false);
    expect(parseStatementPdfStorageRef(`s3v2:${LOCAL}`, ORG, STMT)).toEqual({
      ok: false,
      reason: "UNKNOWN_REF",
    });
  });

  it("rejects traversal and cross-statement keys for both backends", () => {
    expect(
      parseStatementPdfStorageRef(
        `private/statements/${ORG}/${STMT}/../secret.pdf`,
        ORG,
        STMT,
      ).ok,
    ).toBe(false);
    expect(
      parseStatementPdfStorageRef(
        `s3v1:private/statements/${ORG}/00000000-0000-4000-8000-00000000ffff/file.pdf`,
        ORG,
        STMT,
      ).ok,
    ).toBe(false);
  });
});
