import { describe, expect, it, vi } from "vitest";

import {
  acquirePrismaClient,
  CACHED_CLIENT_TARGET_MISMATCH,
} from "@/lib/db/prisma-acquire";
import { isolatedPrismaBlockedMessage } from "@/lib/testing/isolated-database";

const working = "postgresql://test:fake@localhost/bits";
const isolated = "postgresql://test:fake@localhost/bits_e2e";
const isolatedOther = "postgresql://test:fake@localhost/bits_e2e_other";

const readyChild = {
  VITEST: "true",
  BITS_ISOLATED_DATABASE: "1",
  DATABASE_URL: isolated,
  BITS_WORKING_DATABASE_URL: working,
  BITS_E2E_DATABASE_URL: isolated,
};

function acquire(env: Record<string, string | undefined>, cache = {}) {
  const create = vi.fn((url: string) => ({ url }));
  const client = acquirePrismaClient({
    env,
    cache,
    isCurrent: (value) => Boolean(value),
    create,
  });
  return { create, client, cache };
}

describe("prisma acquire connection guard", () => {
  it("does not construct a client for the Core 11D reproduction", () => {
    const create = vi.fn();
    expect(() =>
      acquirePrismaClient({
        env: {
          VITEST: "true",
          BITS_ISOLATED_DATABASE: "1",
          DATABASE_URL: working,
          BITS_WORKING_DATABASE_URL: working,
          BITS_E2E_DATABASE_URL: isolated,
        },
        cache: {},
        isCurrent: () => false,
        create,
      }),
    ).toThrow(/same PostgreSQL database as BITS_E2E_DATABASE_URL/i);
    expect(create).not.toHaveBeenCalled();
  });

  it("does not construct a client when the isolated flag is set without a preserved working URL", () => {
    const create = vi.fn();
    expect(() =>
      acquirePrismaClient({
        env: {
          VITEST: "true",
          BITS_ISOLATED_DATABASE: "1",
          DATABASE_URL: isolated,
          BITS_E2E_DATABASE_URL: isolated,
        },
        cache: {},
        isCurrent: () => false,
        create,
      }),
    ).toThrow(/BITS_WORKING_DATABASE_URL must preserve/i);
    expect(create).not.toHaveBeenCalled();
  });

  it("constructs once from the isolated URL and reuses the cache for the same destination", () => {
    const cache = {};
    const first = acquire(readyChild, cache);
    const second = acquirePrismaClient({
      env: readyChild,
      cache,
      isCurrent: (value) => Boolean(value),
      create: first.create,
    });
    expect(first.create).toHaveBeenCalledTimes(1);
    expect(first.create).toHaveBeenCalledWith(isolated);
    expect(second).toBe(first.client);
  });

  it("rejects a late env destination change instead of reusing the cached client", () => {
    const cache = {};
    const first = acquire(readyChild, cache);
    expect(() =>
      acquirePrismaClient({
        env: {
          ...readyChild,
          DATABASE_URL: isolatedOther,
          BITS_E2E_DATABASE_URL: isolatedOther,
        },
        cache,
        isCurrent: (value) => Boolean(value),
        create: first.create,
      }),
    ).toThrow(CACHED_CLIENT_TARGET_MISMATCH);
    expect(first.create).toHaveBeenCalledTimes(1);
  });

  it("rejects reuse after the isolated flag is removed", () => {
    const cache = {};
    const first = acquire(readyChild, cache);
    expect(() =>
      acquirePrismaClient({
        env: {
          VITEST: "true",
          DATABASE_URL: isolated,
          BITS_WORKING_DATABASE_URL: working,
          BITS_E2E_DATABASE_URL: isolated,
        },
        cache,
        isCurrent: (value) => Boolean(value),
        create: first.create,
      }),
    ).toThrow(isolatedPrismaBlockedMessage());
    expect(first.create).toHaveBeenCalledTimes(1);
  });

  it("rejects a cached working client after isolated flags appear", () => {
    const create = vi.fn((url: string) => ({ url }));
    const cache = {
      prisma: { url: working },
      prismaTargetKey: "loopback\x005432\x00bits",
    };
    expect(() =>
      acquirePrismaClient({
        env: readyChild,
        cache,
        isCurrent: (value) => Boolean(value),
        create,
      }),
    ).toThrow(CACHED_CLIENT_TARGET_MISMATCH);
    expect(create).not.toHaveBeenCalled();
  });

  it("does not construct when credentials change but the destination remains working bits", () => {
    const create = vi.fn();
    expect(() =>
      acquirePrismaClient({
        env: {
          VITEST: "true",
          BITS_ISOLATED_DATABASE: "1",
          DATABASE_URL: "postgresql://other:fake@127.0.0.1/bits",
          BITS_WORKING_DATABASE_URL: working,
          BITS_E2E_DATABASE_URL: isolated,
        },
        cache: {},
        isCurrent: () => false,
        create,
      }),
    ).toThrow(/same PostgreSQL database as BITS_E2E_DATABASE_URL/i);
    expect(create).not.toHaveBeenCalled();
  });

  it("keeps production construction on DATABASE_URL when VITEST is unset", () => {
    const created = acquire({ DATABASE_URL: working });
    expect(created.create).toHaveBeenCalledWith(working);
  });
});
