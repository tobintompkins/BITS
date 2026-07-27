import { NextRequest, NextResponse } from "next/server";

import { allowPublicPrayerRequest } from "@/lib/security/public-prayer-rate-limit";
import { publicPrayerRequestSchema } from "@/lib/validation/public-prayer-request";
import { createPrayerRequest } from "@/server/repositories/care-engagement.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

const PUBLIC_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 12_000;

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ message: "Request not allowed." }, { status: 403 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ message: "Request is too large." }, { status: 413 });
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  const clientKey = forwardedFor?.split(",")[0]?.trim() || "local";
  if (!allowPublicPrayerRequest(clientKey)) {
    return NextResponse.json(
      { message: "Please wait before sending another request." },
      { status: 429 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request." }, { status: 400 });
  }

  const parsed = publicPrayerRequestSchema.safeParse(payload);
  if (!parsed.success || parsed.data.website) {
    return NextResponse.json(
      { message: "Please check the prayer request and try again." },
      { status: 400 },
    );
  }

  const organization = await findPrimaryOrganization();
  if (!organization) {
    return NextResponse.json(
      { message: "Prayer requests are temporarily unavailable." },
      { status: 503 },
    );
  }

  const now = new Date();
  const sharePublicly = parsed.data.sharePublicly;
  await createPrayerRequest({
    organizationId: organization.id,
    requesterName: parsed.data.anonymous ? null : parsed.data.name || null,
    requesterContact: parsed.data.contact || null,
    request: parsed.data.request,
    status: "ACTIVE",
    privacyLevel: sharePublicly ? "PUBLIC" : "PASTORAL_STAFF",
    isPublic: sharePublicly,
    publicPublishedAt: sharePublicly ? now : null,
    publicExpiresAt: sharePublicly
      ? new Date(now.getTime() + PUBLIC_LIFETIME_MS)
      : null,
    assignedToUserId: null,
    createdByUserId: null,
  });

  return NextResponse.json(
    {
      message: sharePublicly
        ? "Your request was sent and shared on the Prayer Wall."
        : "Your private request was sent to church leadership.",
    },
    { status: 201 },
  );
}
