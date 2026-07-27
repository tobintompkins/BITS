"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";

export type NavItem = {
  href: string;
  label: string;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

type AppShellNavProps = {
  groups: NavGroup[];
};

export function isNavItemActive(pathname: string, href: string) {
  const route = href.split("?")[0];
  return pathname === route || pathname.startsWith(`${route}/`);
}

function Group({
  group,
  pathname,
  onNavigate,
}: {
  group: NavGroup;
  pathname: string;
  onNavigate?: () => void;
}) {
  const panelId = useId();
  const containsActive = group.items.some((item) =>
    isNavItemActive(pathname, item.href),
  );
  const [expanded, setExpanded] = useState(containsActive);
  const isOpen = containsActive || expanded;

  return (
    <section className="border-b border-white/10 pb-2 last:border-0">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setExpanded((open) => !open)}
        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.14em] text-white/70 transition hover:bg-white/10 hover:text-white"
      >
        {group.label}
        <span
          aria-hidden="true"
          className={`text-base transition-transform ${isOpen ? "rotate-90" : ""}`}
        >
          ›
        </span>
      </button>
      <div id={panelId} hidden={!isOpen} className="mt-1 space-y-1">
        {group.items.map((item) => {
          const isActive = isNavItemActive(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={isActive ? "page" : undefined}
              className={`block rounded-lg border-l-4 px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "border-[var(--bits-gold)] bg-white text-[var(--bits-navy-deep)] shadow-sm"
                  : "border-transparent text-white/85 hover:bg-white/10 hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function Navigation({
  groups,
  onNavigate,
}: AppShellNavProps & { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Leadership Portal" className="space-y-2">
      {groups
        .filter((group) => group.items.length > 0)
        .map((group) => (
          <Group
            key={group.label}
            group={group}
            pathname={pathname}
            onNavigate={onNavigate}
          />
        ))}
    </nav>
  );
}

export function AppShellNav({ groups }: AppShellNavProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const drawerId = useId();

  useEffect(() => {
    if (!mobileOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [mobileOpen]);

  return (
    <>
      <button
        type="button"
        aria-expanded={mobileOpen}
        aria-controls={drawerId}
        onClick={() => setMobileOpen((open) => !open)}
        className="inline-flex w-full items-center justify-between rounded-xl bg-[var(--bits-navy)] px-4 py-3 text-sm font-semibold text-white shadow-sm lg:hidden"
      >
        Leadership navigation
        <span aria-hidden="true">{mobileOpen ? "Close" : "Menu"}</span>
      </button>
      <div
        id={drawerId}
        hidden={!mobileOpen}
        className="mt-2 rounded-2xl bg-[var(--bits-navy-deep)] p-3 shadow-xl lg:hidden"
      >
        <Navigation groups={groups} onNavigate={() => setMobileOpen(false)} />
      </div>
      <div className="hidden lg:block">
        <Navigation groups={groups} />
      </div>
    </>
  );
}
