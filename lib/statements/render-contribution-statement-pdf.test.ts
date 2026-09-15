import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import {
  renderContributionStatementPdf,
  type ContributionStatementPdfSnapshot,
} from "./render-contribution-statement-pdf";

const ADDRESS = {
  line1: "100 Church St",
  line2: null,
  city: "Saco",
  state: "ME",
  postalCode: "04072",
  country: "US",
};

function baseSnapshot(
  overrides: Partial<ContributionStatementPdfSnapshot> = {},
): ContributionStatementPdfSnapshot {
  return {
    statementType: "INDIVIDUAL",
    statementIdentifier: "STMT-2026-ANN",
    periodStart: new Date("2026-01-01T00:00:00.000Z"),
    periodEnd: new Date("2026-12-31T00:00:00.000Z"),
    generatedAt: new Date("2026-09-14T16:00:00.000Z"),
    organization: {
      name: "First United Pentecostal Church",
      address: ADDRESS,
    },
    recipient: {
      name: "Ann Adams",
      address: {
        line1: "10 Oak St",
        city: "Townville",
        state: "TN",
        postalCode: "37000",
        country: "US",
      },
    },
    lines: [
      {
        offeringDate: new Date("2026-02-01T00:00:00.000Z"),
        fundName: "Tithe",
        deductibleAmount: "54.00",
      },
      {
        offeringDate: new Date("2026-02-01T00:00:00.000Z"),
        fundName: "Missions",
        deductibleAmount: "36.00",
      },
    ],
    deductibleTotal: "90.00",
    footerText: "No goods or services were provided in return for these gifts.",
    ...overrides,
  };
}

function asText(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("latin1");
}

/** pdf-lib stores page text as Flate-compressed hex strings, not literal HTML. */
function decodePdfHexStrings(content: string) {
  return content.replace(/<([0-9A-Fa-f]+)>/g, (_all, hex: string) =>
    Buffer.from(hex, "hex").toString("latin1"),
  );
}

function decodedPdfText(bytes: Uint8Array) {
  const buffer = Buffer.from(bytes);
  const raw = buffer.toString("latin1");
  const parts: string[] = [];
  const header =
    /\/Filter\s*\/FlateDecode[\s\S]{0,120}?\/Length\s+(\d+)\s*>>\s*stream\r?\n/g;
  for (const match of raw.matchAll(header)) {
    const length = Number(match[1]);
    const dataStart = (match.index ?? 0) + match[0].length;
    try {
      parts.push(
        decodePdfHexStrings(
          inflateSync(buffer.subarray(dataStart, dataStart + length)).toString(
            "latin1",
          ),
        ),
      );
    } catch {
      // Content may already be uncompressed.
    }
  }
  return parts.join("\n");
}

describe("contribution statement PDF renderer", () => {
  it("returns PDF bytes that start with %PDF-", async () => {
    const bytes = await renderContributionStatementPdf(baseSnapshot());
    expect(bytes.byteLength).toBeGreaterThan(200);
    expect(asText(bytes).startsWith("%PDF-")).toBe(true);
    expect(decodedPdfText(bytes)).not.toMatch(/Preview Only/i);
  });

  it("renders individual and household snapshots", async () => {
    const individual = decodedPdfText(
      await renderContributionStatementPdf(baseSnapshot()),
    );
    const household = decodedPdfText(
      await renderContributionStatementPdf(
        baseSnapshot({
          statementType: "HOUSEHOLD",
          statementIdentifier: "STMT-2026-ADAMS-HH",
          recipient: {
            name: "Adams Household",
            address: ADDRESS,
          },
        }),
      ),
    );
    expect(individual).toContain("Individual");
    expect(individual).toContain("Contribution Statement");
    expect(household).toContain("Household");
    expect(household).toContain("STMT-2026-ADAMS-HH");
  });

  it("renders multi-row statements as non-empty valid PDFs", async () => {
    const lines = Array.from({ length: 40 }, (_, index) => ({
      offeringDate: new Date(Date.UTC(2026, 0, 1 + (index % 28))),
      fundName: `Fund ${index + 1}`,
      deductibleAmount: "10.00",
    }));
    const bytes = await renderContributionStatementPdf(
      baseSnapshot({
        lines,
        deductibleTotal: "400.00",
      }),
    );
    expect(asText(bytes).startsWith("%PDF-")).toBe(true);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(decodedPdfText(bytes)).toMatch(/Fund 1|Fund 40/);
  });

  it("treats dangerous recipient and footer text as plain text", async () => {
    const payload =
      '<script>alert("xss")</script><img src=x onerror=alert(1)>';
    const bytes = await renderContributionStatementPdf(
      baseSnapshot({
        recipient: {
          name: payload,
          address: ADDRESS,
        },
        footerText: `${payload}\nNo goods or services were provided.`,
      }),
    );
    const text = decodedPdfText(bytes);
    expect(asText(bytes).startsWith("%PDF-")).toBe(true);
    expect(text).toContain("script");
    expect(text).toContain("onerror");
    expect(text).not.toMatch(/<html[\s>]/i);
  });

  it("does not require browser APIs", async () => {
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
    const bytes = await renderContributionStatementPdf(baseSnapshot());
    expect(bytes).toBeInstanceOf(Uint8Array);
  });
});
