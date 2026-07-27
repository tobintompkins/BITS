import { describe, expect, it } from "vitest";

import { isNavItemActive, type NavGroup } from "./app-shell-nav";

describe("leadership navigation", () => {
  it("matches exact and nested routes without changing hrefs", () => {
    expect(isNavItemActive("/events", "/events")).toBe(true);
    expect(isNavItemActive("/events/abc", "/events")).toBe(true);
    expect(isNavItemActive("/members", "/members?recordStatus=ARCHIVED")).toBe(
      true,
    );
    expect(isNavItemActive("/reports", "/events")).toBe(false);
  });

  it("allows empty permission-filtered groups to be omitted", () => {
    const groups: NavGroup[] = [
      { label: "Home", items: [{ href: "/dashboard", label: "Home" }] },
      { label: "Restricted", items: [] },
    ];

    expect(groups.filter((group) => group.items.length > 0)).toHaveLength(1);
  });
});
