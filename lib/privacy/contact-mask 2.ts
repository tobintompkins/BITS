export function maskEmail(email: string | null | undefined) {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  return `${local.slice(0, 1)}***@${domain}`;
}

export function maskPhone(phone: string | null | undefined) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `***-***-${digits.slice(-4)}`;
}

export function shortenStripeCheckoutSessionId(sessionId: string) {
  if (sessionId.length <= 14) return sessionId;
  return `${sessionId.slice(0, 8)}…${sessionId.slice(-4)}`;
}

export function parseStripeGiftAttribution(note: string | null | undefined) {
  if (!note) return { donorName: null, donorEmail: null };
  const donorEmail =
    note.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() ??
    null;
  const withoutPrefix = note.replace(/^Stripe sandbox test gift\s*/i, "");
  const namePart = withoutPrefix
    .split("·")
    .map((part) => part.trim())
    .find((part) => part && !part.includes("@"));
  return {
    donorName: namePart || null,
    donorEmail,
  };
}
