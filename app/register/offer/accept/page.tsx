import Link from "next/link";

import { acceptPromotionOfferAction } from "@/app/register/actions";

export default async function AcceptPromotionOfferPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const token = params.token?.trim() ?? "";

  let result: { status: "success" | "error"; message: string; confirmationCode?: string } | null =
    null;

  if (token) {
    const formData = new FormData();
    formData.set("token", token);
    result = await acceptPromotionOfferAction(formData);
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Accept waitlist offer</h1>
      {!token ? (
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          This page requires a valid offer link from your notification.
        </p>
      ) : result?.status === "success" ? (
        <div className="mt-6 space-y-3 text-sm">
          <p className="text-emerald-700 dark:text-emerald-400">{result.message}</p>
          {result.confirmationCode ? (
            <Link
              href={`/register/confirmation/${result.confirmationCode}`}
              className="inline-flex rounded-md bg-zinc-900 px-4 py-2 text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              View confirmation
            </Link>
          ) : null}
        </div>
      ) : (
        <p className="mt-6 text-sm text-red-700 dark:text-red-400">
          {result?.message ?? "Unable to process this offer."}
        </p>
      )}
    </main>
  );
}
