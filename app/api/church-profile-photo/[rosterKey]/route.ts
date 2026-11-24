import { NextResponse } from "next/server";

import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { isAllowedCheckoutRequestOrigin } from "@/lib/validation/member-stripe-giving";
import { prisma } from "@/lib/db/prisma";
import { RoleCode } from "@/app/generated/prisma/client";
import type { ChurchProfileViewer } from "@/lib/church/church-profile-access";
import {
  readChurchProfilePhoto,
  removeChurchProfilePhoto,
  saveChurchProfilePhoto,
} from "@/server/services/church-person-profile.service";

export const runtime = "nodejs";

async function currentViewer(): Promise<ChurchProfileViewer | null> {
  const account = await getOrCreateUserAccount();
  if (!account?.active) return null;
  const membership = await prisma.organizationMembership.findFirst({
    where: { userAccountId: account.id, active: true, churchAccess: "ACTIVE" },
    include: { roleType: true },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) return null;
  return {
    organizationId: membership.organizationId,
    userAccountId: account.id,
    active: true,
    churchAccess: "ACTIVE",
    isAdmin: membership.roleType.code === RoleCode.ORG_ADMIN,
  };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ rosterKey: string }> },
) {
  const { rosterKey } = await context.params;
  const photo = await readChurchProfilePhoto(rosterKey, await currentViewer());
  if (!photo) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(photo.bytes), {
    headers: {
      "Content-Type": photo.contentType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ rosterKey: string }> },
) {
  if (!request.headers.get("origin") || !isAllowedCheckoutRequestOrigin(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  const { rosterKey } = await context.params;
  const bytes = new Uint8Array(await request.arrayBuffer());
  try {
    const result = await saveChurchProfilePhoto(rosterKey, bytes);
    if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Photo was not saved.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ rosterKey: string }> },
) {
  if (!request.headers.get("origin") || !isAllowedCheckoutRequestOrigin(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  const { rosterKey } = await context.params;
  try {
    const result = await removeChurchProfilePhoto(rosterKey);
    if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Photo was not removed." }, { status: 400 });
  }
}
