"use client";

import { useClerk } from "@clerk/nextjs";

export function OpenSignInSecurity() {
  const { openUserProfile } = useClerk();
  return (
    <button
      type="button"
      onClick={() => openUserProfile()}
      className="bits-button rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
    >
      Sign-in &amp; Security
    </button>
  );
}
