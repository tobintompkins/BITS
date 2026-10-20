import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearManualDonationOperationToken,
  manualCreateTokenStorageKey,
  parseCreateOperationToken,
  readOrCreateManualDonationOperationToken,
} from "./create-operation-token";

const BATCH_ID = "11111111-1111-4111-8111-111111111111";

describe("manual create operation tokens", () => {
  const memory = new Map<string, string>();

  beforeEach(() => {
    memory.clear();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
      removeItem: (key: string) => {
        memory.delete(key);
      },
      clear: () => memory.clear(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reuses the stored token across retries and reloads of the same gift form", () => {
    const first = readOrCreateManualDonationOperationToken(BATCH_ID);
    expect(parseCreateOperationToken(first)).toBe(first);
    expect(sessionStorage.getItem(manualCreateTokenStorageKey(BATCH_ID))).toBe(
      first,
    );
    expect(readOrCreateManualDonationOperationToken(BATCH_ID)).toBe(first);
  });

  it("rotates only after a confirmed success or a new-gift action", () => {
    const first = readOrCreateManualDonationOperationToken(BATCH_ID);
    clearManualDonationOperationToken(BATCH_ID);
    const next = readOrCreateManualDonationOperationToken(BATCH_ID);
    expect(next).not.toBe(first);
    expect(parseCreateOperationToken(next)).toBe(next);
  });
});
