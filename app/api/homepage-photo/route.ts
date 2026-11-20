import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { findPublicOrganization } from "@/server/repositories/public-organization.repository";
import { homepagePhotoAdmin, HomepagePhotoError, saveHomepagePhoto } from "@/server/services/homepage-photo.service";
import { MAX_HOMEPAGE_UPLOAD, prepareHomepagePhoto } from "@/lib/validation/homepage-photo";
import { isAllowedCheckoutRequestOrigin } from "@/lib/validation/member-stripe-giving";

export const runtime = "nodejs";

export async function GET() {
  try {
    const organization = await findPublicOrganization();
    if (!organization) return new Response(null, { status: 404 });
    const photo = await prisma.homepagePhoto.findUnique({ where: { organizationId: organization.id } });
    if (!photo) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(photo.image), { headers: {
      "Content-Type": "image/webp", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return new Response(null, { status: 404 });
  }
}

export async function POST(request: Request) {
  if (!request.headers.get("origin") || !isAllowedCheckoutRequestOrigin(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  if (!await homepagePhotoAdmin()) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  const versionText = request.headers.get("x-photo-version") ?? "";
  if (!/^\d{1,9}$/.test(versionText)) return NextResponse.json({ error: "Refresh before saving." }, { status: 400 });
  const reader = request.body?.getReader();
  if (!reader) return NextResponse.json({ error: "Choose a photo." }, { status: 400 });
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.length;
      if (bytes > MAX_HOMEPAGE_UPLOAD) {
        await reader.cancel();
        return NextResponse.json({ error: "Choose a photo smaller than 5 MB." }, { status: 413 });
      }
      chunks.push(part.value);
    }
    let prepared;
    try {
      prepared = await prepareHomepagePhoto(Buffer.concat(chunks), decodeURIComponent(request.headers.get("x-photo-description") ?? ""));
    } catch {
      return NextResponse.json({ error: "Choose a still JPEG, PNG, or WebP under 5 MB, and add a description (1–200 characters)." }, { status: 400 });
    }
    const version = await saveHomepagePhoto({ ...prepared, expectedVersion: Number(versionText) });
    revalidatePath("/");
    return NextResponse.json({ version });
  } catch (error) {
    if (error instanceof HomepagePhotoError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Photo could not be saved. Ask the operator to check photo storage setup, then try again." }, { status: 503 });
  } finally { reader.releaseLock(); }
}
