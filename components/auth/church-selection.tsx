"use client";
import { useClerk } from "@clerk/nextjs";
import { useState } from "react";

export function ChurchSelection({ churches }: { churches: { name: string; clerkId: string }[] }) {
  const clerk = useClerk();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function select(organization: string) {
    setBusy(true); setError("");
    try {
      await clerk.setActive({ organization, navigate: async ({ decorateUrl }) => {
        window.location.assign(decorateUrl("/dashboard"));
      } });
    } catch { setError("This church could not be selected. Check your access or try again."); setBusy(false); }
  }
  return <div className="space-y-4">
    {churches.length === 0 && <p>No linked church is available for your account. Contact your administrator.</p>}
    {churches.map(church => <button key={church.clerkId} disabled={busy} onClick={() => select(church.clerkId)}
      className="block w-full rounded-xl bg-[var(--bits-navy)] p-4 text-left font-semibold text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]">{church.name}</button>)}
    {error && <p role="alert">{error}</p>}
  </div>;
}
