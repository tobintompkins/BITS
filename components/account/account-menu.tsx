"use client";

import { UserButton } from "@clerk/nextjs";

function MenuIcon({ children }: { children: string }) {
  return (
    <span aria-hidden="true" className="text-sm leading-none">
      {children}
    </span>
  );
}

export function AccountMenu() {
  return (
    <UserButton>
      <UserButton.MenuItems>
        <UserButton.Link
          href="/portal/account"
          label="My Account"
          labelIcon={<MenuIcon>⌂</MenuIcon>}
        />
        <UserButton.Action label="manageAccount" />
      </UserButton.MenuItems>
    </UserButton>
  );
}
