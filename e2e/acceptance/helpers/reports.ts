import { expect, type Page } from "@playwright/test";

import type { OriginalV1Manifest } from "../fixtures/manifest";

export function contributionCsvPath(
  manifest: OriginalV1Manifest,
  extra: Record<string, string> = {},
) {
  const params = new URLSearchParams({
    view: "detail",
    startDate: manifest.period.startDate,
    endDate: manifest.period.endDate,
    organizationId: extra.organizationId ?? manifest.orgs.a.id,
    ...extra,
  });
  return `/api/staff/reports/contributions/csv?${params}`;
}

export function batchCsvPath(manifest: OriginalV1Manifest, org: "a" | "b" = "a") {
  const params = new URLSearchParams({
    startDate: manifest.period.startDate,
    endDate: manifest.period.endDate,
    organizationId: manifest.orgs[org].id,
  });
  return `/api/staff/reports/batches/csv?${params}`;
}

export function statementAccessCsvPath(
  manifest: OriginalV1Manifest,
  org: "a" | "b" = "a",
) {
  const params = new URLSearchParams({
    startDate: manifest.period.startDate,
    endDate: manifest.period.endDate,
    organizationId: manifest.orgs[org].id,
  });
  return `/api/staff/reports/statement-access/csv?${params}`;
}

export async function readCsv(page: Page, path: string) {
  const response = await page.request.get(path);
  return { response, text: await response.text() };
}

export function expectDeniedStatus(
  status: number,
  allowed: number[] = [401, 403, 404],
) {
  expect(allowed).toContain(status);
}

export function assertOrgACsv(text: string, manifest: OriginalV1Manifest) {
  expect(text).toContain(manifest.donors.a1.amount);
  expect(text).toContain(manifest.donors.a2.amount);
  expect(text).toContain(manifest.donors.a1.label.split(", ")[1]!);
  expect(text).not.toContain(manifest.donors.b1.amount);
  expect(text).not.toContain("Drew");
}

export function assertOrgBCsv(text: string, manifest: OriginalV1Manifest) {
  expect(text).toContain(manifest.donors.b1.amount);
  expect(text).toContain("Drew");
  expect(text).not.toContain(manifest.donors.a1.amount);
  expect(text).not.toContain("Avery");
}
