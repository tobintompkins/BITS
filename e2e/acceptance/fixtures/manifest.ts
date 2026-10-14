import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const ORIGINAL_V1_MANIFEST_PATH = path.join(
  process.cwd(),
  "e2e/.auth/original-v1-manifest.json",
);

export type OriginalV1NamedRecord = {
  id: string;
  label: string;
};

export type OriginalV1AmountRecord = OriginalV1NamedRecord & {
  amount: string;
};

export type OriginalV1StatementRecord = {
  id: string;
  marker: string;
};

export type OriginalV1Manifest = {
  runId: string;
  prefix: string;
  offeringDate: string;
  period: { startDate: string; endDate: string };
  orgs: {
    a: { id: string; clerkOrganizationId: string; name: string };
    b: { id: string; clerkOrganizationId: string; name: string };
  };
  users: Record<
    | "orgAdmin"
    | "treasurer"
    | "dataEntry"
    | "reportViewer"
    | "donorA1"
    | "donorA2"
    | "multiOrg",
    { id: string; clerkUserId: string }
  >;
  donors: {
    a1: OriginalV1AmountRecord;
    a2: OriginalV1AmountRecord;
    aUnassigned: OriginalV1NamedRecord;
    b1: OriginalV1AmountRecord;
  };
  households: {
    a: OriginalV1NamedRecord;
    b: OriginalV1NamedRecord;
  };
  offeringTypes: {
    a: OriginalV1NamedRecord;
    b: OriginalV1NamedRecord;
  };
  batches: {
    a: OriginalV1NamedRecord;
    b: OriginalV1NamedRecord;
  };
  donations: {
    a1: { id: string; amount: string };
    a2: { id: string; amount: string };
    b1: { id: string; amount: string };
  };
  statements: {
    a1Published: OriginalV1StatementRecord;
    a1Generated: OriginalV1StatementRecord;
    a2Published: OriginalV1StatementRecord;
    aHouseholdPublished: OriginalV1StatementRecord;
    b1Published: OriginalV1StatementRecord;
    b1Generated: OriginalV1StatementRecord;
  };
};

export async function writeOriginalV1Manifest(manifest: OriginalV1Manifest) {
  await mkdir(path.dirname(ORIGINAL_V1_MANIFEST_PATH), { recursive: true });
  await writeFile(
    ORIGINAL_V1_MANIFEST_PATH,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
}

export async function readOriginalV1Manifest() {
  const raw = await readFile(ORIGINAL_V1_MANIFEST_PATH, "utf8");
  return JSON.parse(raw) as OriginalV1Manifest;
}

export async function tryReadOriginalV1Manifest() {
  try {
    return await readOriginalV1Manifest();
  } catch {
    return null;
  }
}
