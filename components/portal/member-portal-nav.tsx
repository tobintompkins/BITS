"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import {
  MEMBER_PORTAL_NAV_GROUPS,
  isMemberPortalNavActive,
} from "@/lib/portal/member-portal-nav";

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

function headerLinkClass(active: boolean) {
  return `rounded-lg px-3 py-2 text-sm font-semibold ${focusClass} ${
    active
      ? "bg-white text-[var(--bits-navy-deep)]"
      : "text-white/85 hover:bg-white/10 hover:text-white"
  }`;
}

export function MemberPortalNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const closeOnPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("mousedown", closeOnPointer);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("mousedown", closeOnPointer);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative flex items-center gap-2 sm:gap-3">
      <nav aria-label="Member portal" className="flex items-center gap-2">
        <Link
          href="/portal"
          aria-current={pathname === "/portal" ? "page" : undefined}
          onClick={() => setOpen(false)}
          className={`hidden sm:inline-flex ${headerLinkClass(pathname === "/portal")}`}
        >
          Home
        </Link>
        <Link
          href="/portal/gifts"
          aria-current={
            isMemberPortalNavActive(pathname, "/portal/gifts")
              ? "page"
              : undefined
          }
          onClick={() => setOpen(false)}
          className={`hidden sm:inline-flex ${headerLinkClass(
            isMemberPortalNavActive(pathname, "/portal/gifts"),
          )}`}
        >
          My Giving
        </Link>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={menuId}
          aria-haspopup="true"
          onClick={() => setOpen((value) => !value)}
          className={`inline-flex items-center rounded-lg px-3 py-2 text-sm font-semibold ${focusClass} ${
            open
              ? "bg-[var(--bits-gold)] text-[var(--bits-navy-deep)]"
              : "text-white/85 hover:bg-white/10 hover:text-white"
          }`}
        >
          {open ? "Close menu" : "Menu"}
        </button>
        <Link
          href="/"
          onClick={() => setOpen(false)}
          className={`hidden text-sm text-white/80 hover:text-white md:inline ${focusClass}`}
        >
          Public Home
        </Link>
      </nav>

      <div
        id={menuId}
        hidden={!open}
        className="absolute right-0 top-full z-30 mt-3 w-[min(36rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-[var(--bits-navy-deep)] p-4 text-white shadow-xl"
      >
        <nav aria-label="Member portal menu">
          <div className="mb-4 flex flex-wrap gap-2 sm:hidden">
            <Link
              href="/portal"
              aria-current={pathname === "/portal" ? "page" : undefined}
              onClick={() => setOpen(false)}
              className={headerLinkClass(pathname === "/portal")}
            >
              Home
            </Link>
            <Link
              href="/portal/gifts"
              aria-current={
                isMemberPortalNavActive(pathname, "/portal/gifts")
                  ? "page"
                  : undefined
              }
              onClick={() => setOpen(false)}
              className={headerLinkClass(
                isMemberPortalNavActive(pathname, "/portal/gifts"),
              )}
            >
              My Giving
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {MEMBER_PORTAL_NAV_GROUPS.map((group) => (
              <section key={group.heading}>
                <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--bits-gold)]">
                  {group.heading}
                </h2>
                <ul className="mt-2 space-y-1">
                  {group.items.map((item) => {
                    const active = isMemberPortalNavActive(pathname, item.href);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          onClick={() => setOpen(false)}
                          className={`block rounded-lg px-2 py-1.5 text-sm ${focusClass} ${
                            active
                              ? "bg-white font-semibold text-[var(--bits-navy-deep)]"
                              : "text-white/85 hover:bg-white/10 hover:text-white"
                          }`}
                        >
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
          <p className="mt-4 border-t border-white/10 pt-3 md:hidden">
            <Link
              href="/"
              onClick={() => setOpen(false)}
              className={`text-sm font-semibold text-[var(--bits-gold)] underline ${focusClass}`}
            >
              Public Home
            </Link>
          </p>
        </nav>
      </div>
    </div>
  );
}
