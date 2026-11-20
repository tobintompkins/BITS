import path from "node:path";

import { describe, expect, it } from "vitest";

import { resolveEventImageAbsolutePath } from "./event-image";

const ORG = "00000000-0000-4000-8000-00000000a001";
const EVENT = "00000000-0000-4000-8000-00000000b001";

describe("resolveEventImageAbsolutePath", () => {
  it("keeps a generated featured image inside event storage", () => {
    const absolute = resolveEventImageAbsolutePath(
      `/uploads/events/${ORG}/${EVENT}/featured.jpg`,
    );
    expect(absolute).toBe(
      path.resolve(
        process.cwd(),
        "public",
        "uploads",
        "events",
        ORG,
        EVENT,
        "featured.jpg",
      ),
    );
  });

  it("rejects traversal and keys outside the event image prefix", () => {
    expect(
      resolveEventImageAbsolutePath(
        `/uploads/events/${ORG}/${EVENT}/../../../../.env`,
      ),
    ).toBeNull();
    expect(resolveEventImageAbsolutePath("private/../../.env")).toBeNull();
    expect(
      resolveEventImageAbsolutePath("/uploads/organizations/logo.png"),
    ).toBeNull();
  });
});
