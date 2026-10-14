import { Client } from "pg";
import { describe, expect, it } from "vitest";

import {
  isolatedDatabaseNameIsDedicated,
  parsePostgresTargetIdentity,
  postgresTargetsAreEquivalent,
} from "./original-v1-database-url";

describe("original v1 database target identity", () => {
  it("treats localhost and 127.0.0.1 aliases of the same database as equivalent", () => {
    expect(
      postgresTargetsAreEquivalent(
        "postgresql://postgres:secret@localhost/bits?schema=public",
        "postgres://postgres:other@127.0.0.1:5432/bits",
      ),
    ).toBe(true);
  });

  it("treats different usernames and passwords against the same destination as equivalent", () => {
    expect(
      postgresTargetsAreEquivalent(
        "postgresql://app:secret@localhost:5432/shared_e2e",
        "postgresql://tester:other@127.0.0.1:5432/shared_e2e",
      ),
    ).toBe(true);
  });

  it("ignores hostaddr the same way the installed pg driver does", () => {
    const base = "postgresql://app:fake@localhost:5432/shared_e2e";
    const withHostaddr = `${base}?hostaddr=192.0.2.10`;
    const driverBase = new Client({ connectionString: base });
    const driverHostaddr = new Client({ connectionString: withHostaddr });

    expect(driverBase.host).toBe(driverHostaddr.host);
    expect(driverBase.database).toBe(driverHostaddr.database);
    void driverBase.end();
    void driverHostaddr.end();
    expect(postgresTargetsAreEquivalent(base, withHostaddr)).toBe(true);
  });

  it("honors host and port query overrides as the real destination", () => {
    expect(
      postgresTargetsAreEquivalent(
        "postgresql://app@localhost:5432/bits?host=127.0.0.1",
        "postgresql://tester@127.0.0.1:5432/bits",
      ),
    ).toBe(true);
    expect(
      postgresTargetsAreEquivalent(
        "postgresql://app@localhost:5432/bits_e2e?host=db.example.test&port=6543",
        "postgresql://tester@localhost:5432/bits_e2e",
      ),
    ).toBe(false);
  });

  it("does not treat bits and bits_e2e as the same target", () => {
    expect(
      postgresTargetsAreEquivalent(
        "postgresql://postgres:secret@localhost:5432/bits",
        "postgresql://postgres:secret@localhost:5432/bits_e2e",
      ),
    ).toBe(false);
  });

  it("requires a dedicated e2e database name", () => {
    expect(isolatedDatabaseNameIsDedicated("bits_e2e")).toBe(true);
    expect(isolatedDatabaseNameIsDedicated("bits")).toBe(false);
    expect(isolatedDatabaseNameIsDedicated("postgres")).toBe(false);
    expect(parsePostgresTargetIdentity("postgresql://localhost:5432/bits_e2e")).toEqual(
      {
        hostname: "loopback",
        port: "5432",
        database: "bits_e2e",
        username: "",
      },
    );
  });
});
