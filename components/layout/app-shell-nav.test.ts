import { describe, expect, it } from "vitest";

import {
  currentNavLabel,
  isNavItemActive,
  type NavGroup,
} from "./app-shell-nav";

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

  it("names the current page for the mobile toggle", () => {
    const groups: NavGroup[] = [
      {
        label: "Giving",
        items: [
          { href: "/batches", label: "Batches" },
          { href: "/batches/corrections", label: "Correction Review Queue" },
        ],
      },
    ];
    expect(currentNavLabel("/batches/abc", groups)).toBe("Batches");
    expect(currentNavLabel("/batches/corrections", groups)).toBe(
      "Correction Review Queue",
    );
    expect(currentNavLabel("/dashboard", groups)).toBe("Leadership navigation");
  });
});
