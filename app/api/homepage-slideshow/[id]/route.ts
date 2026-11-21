import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { isAllowedCheckoutRequestOrigin } from "@/lib/validation/member-stripe-giving";
import { homepagePhotoAdmin } from "@/server/services/homepage-photo.service";
import {
  HomepageSlideshowError,
  publicHomepageSlideshowImage,
  removeHomepageSlideshowPhoto,
} from "@/server/services/homepage-slideshow.service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const image = await publicHomepageSlideshowImage(id);
  if (!image) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(image), { headers: {
    "Content-Type": "image/webp", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
  } });
}

export async function DELETE(request: Request, context: RouteContext) {
  if (!request.headers.get("origin") || !isAllowedCheckoutRequestOrigin(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  if (!await homepagePhotoAdmin()) {
    return NextResponse.json({ error: "Only this church's administrator can change the slideshow." }, { status: 403 });
  }
  try {
    const { id } = await context.params;
    await removeHomepageSlideshowPhoto(id);
    revalidatePath("/");
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof HomepageSlideshowError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "The slideshow photo could not be removed. Try again." }, { status: 503 });
  }
}
