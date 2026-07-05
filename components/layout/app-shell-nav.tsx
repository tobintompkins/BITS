"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/donors", label: "Donors" },
  { href: "/households", label: "Households" },
  { href: "/batches", label: "Batches" },
  { href: "/reports", label: "Reports" },
  { href: "/statements", label: "Statements" },
  { href: "/settings/organization", label: "Settings" },
];

export function AppShellNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="space-y-1">
      {navItems.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "bg-zinc-900 text-white"
                : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
