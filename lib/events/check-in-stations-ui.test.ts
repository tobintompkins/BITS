import { describe, expect, it } from "vitest";

import {
  canStartStationMutation,
  clampStationListPage,
  closeStationButtonLabel,
  closeStationConfirmCopy,
  closeStationSuccessMessage,
  emptyOpenStationForm,
  FORBIDDEN_STATION_UI_FIELDS,
  hasOpenStationFieldErrors,
  nextStationListQueryOnFilterChange,
  normalizeOpenStationPayload,
  openStationSuccessMessage,
  parseStationListQuery,
  shouldApplyStationListResponse,
  stationRowHasForbiddenFields,
  stationStatusLabel,
  validateOpenStationForm,
} from "@/lib/events/check-in-stations-ui";

describe("check-in stations UI helpers", () => {
  it("validates blank and overlong open fields", () => {
    expect(validateOpenStationForm({ name: "  ", deviceLabel: "" })).toEqual({
      name: "Station name is required.",
    });
    expect(
      validateOpenStationForm({
        name: "a".repeat(81),
        deviceLabel: "b".repeat(81),
      }),
    ).toMatchObject({
      name: expect.stringMatching(/at most 80/i),
      deviceLabel: expect.stringMatching(/at most 80/i),
    });
    expect(
      hasOpenStationFieldErrors(
        validateOpenStationForm({ name: "Desk", deviceLabel: "" }),
      ),
    ).toBe(false);
  });

  it("normalizes open payload without invented fields", () => {
    expect(
      normalizeOpenStationPayload({
        name: "  Welcome Desk  ",
        deviceLabel: "  Lobby  ",
      }),
    ).toEqual({ name: "Welcome Desk", deviceLabel: "Lobby" });
    expect(
      normalizeOpenStationPayload({ name: "Desk", deviceLabel: "   " }),
    ).toEqual({ name: "Desk", deviceLabel: null });
    expect(emptyOpenStationForm()).toEqual({ name: "", deviceLabel: "" });
  });

  it("parses list query and resets page on filter change", () => {
    expect(
      parseStationListQuery({ page: "2", pageSize: "25", status: "ACTIVE" }),
    ).toEqual({ page: 2, pageSize: 25, status: "ACTIVE" });
    expect(
      nextStationListQueryOnFilterChange(
        { page: 3, pageSize: 25, status: "ACTIVE" },
        "CLOSED",
      ),
    ).toEqual({ page: 1, pageSize: 25, status: "CLOSED" });
    expect(
      nextStationListQueryOnFilterChange(
        { page: 2, pageSize: 25, status: "ACTIVE" },
        "",
      ),
    ).toEqual({ page: 1, pageSize: 25, status: undefined });
  });

  it("clamps empty or out-of-range pages after close/open", () => {
    expect(clampStationListPage({ page: 3, pageSize: 25, total: 0 })).toBe(1);
    expect(clampStationListPage({ page: 5, pageSize: 25, total: 26 })).toBe(2);
    expect(clampStationListPage({ page: 1, pageSize: 25, total: 26 })).toBe(1);
  });

  it("builds accessible close labels and confirmation copy", () => {
    expect(closeStationButtonLabel("Welcome Desk")).toBe(
      "Close station Welcome Desk",
    );
    const confirm = closeStationConfirmCopy("Welcome Desk");
    expect(confirm.title).toMatch(/close/i);
    expect(confirm.message).toContain("Welcome Desk");
    expect(confirm.message).toMatch(/not yet attached/i);
  });

  it("renders accurate open/close and already-closed feedback", () => {
    expect(openStationSuccessMessage("Desk A")).toContain("Desk A");
    expect(closeStationSuccessMessage("Desk A", "CLOSED")).toMatch(/Closed/);
    expect(
      closeStationSuccessMessage("Desk A", "ALREADY_CLOSED"),
    ).toMatch(/already closed/i);
    expect(stationStatusLabel("ACTIVE")).toBe("Active");
    expect(stationStatusLabel("CLOSED")).toBe("Closed");
  });

  it("blocks duplicate pending mutations and ignores stale list responses", () => {
    expect(canStartStationMutation(false)).toBe(true);
    expect(canStartStationMutation(true)).toBe(false);
    expect(shouldApplyStationListResponse(1, 1)).toBe(true);
    expect(shouldApplyStationListResponse(1, 2)).toBe(false);
  });

  it("rejects forbidden tracking/tenant fields on station rows", () => {
    expect(
      stationRowHasForbiddenFields({
        id: "1",
        name: "Desk",
        status: "ACTIVE",
      }),
    ).toBe(false);
    for (const key of FORBIDDEN_STATION_UI_FIELDS) {
      expect(stationRowHasForbiddenFields({ [key]: "x" })).toBe(true);
    }
  });
});
