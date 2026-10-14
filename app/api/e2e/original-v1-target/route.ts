import { NextResponse } from "next/server";

import {
  ORIGINAL_V1_ACCEPTANCE_FLAG,
  ORIGINAL_V1_TARGET_TOKEN_MIN_LENGTH,
  bearerTokenFromAuthorization,
  originalV1TargetFingerprint,
  timingSafeStringEquals,
} from "@/lib/testing/original-v1-target-token";

function notFound() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

/**
 * Positive isolated-target probe used only by original-v1 acceptance.
 * GET returns a fingerprint of the process DATABASE_URL. It never mutates
 * data, never falls back to another database, and is 404 unless the
 * acceptance flag is set on this server.
 */
function isAcceptanceRuntime() {
  const nodeEnv = process.env.NODE_ENV?.trim();
  const clerkSecret = process.env.CLERK_SECRET_KEY?.trim() ?? "";
  const clerkPublishable =
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ?? "";
  if (nodeEnv === "production") return false;
  if (clerkSecret.startsWith("sk_live_") || clerkPublishable.startsWith("pk_live_")) {
    return false;
  }
  return true;
}

export async function GET(request: Request) {
  if (process.env.BITS_E2E_ACCEPTANCE !== ORIGINAL_V1_ACCEPTANCE_FLAG) {
    return notFound();
  }
  if (!isAcceptanceRuntime()) {
    return notFound();
  }

  const configuredToken = process.env.BITS_E2E_TARGET_TOKEN?.trim() ?? "";
  const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
  if (
    configuredToken.length < ORIGINAL_V1_TARGET_TOKEN_MIN_LENGTH ||
    !databaseUrl
  ) {
    return notFound();
  }

  const provided = bearerTokenFromAuthorization(
    request.headers.get("authorization"),
  );
  if (!provided || !timingSafeStringEquals(configuredToken, provided)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(
    {
      ok: true,
      fingerprint: originalV1TargetFingerprint(configuredToken, databaseUrl),
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
