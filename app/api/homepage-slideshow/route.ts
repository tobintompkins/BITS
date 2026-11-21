import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { isAllowedCheckoutRequestOrigin } from "@/lib/validation/member-stripe-giving";
import { MAX_HOMEPAGE_UPLOAD, prepareHomepagePhoto } from "@/lib/validation/homepage-photo";
import { homepagePhotoAdmin } from "@/server/services/homepage-photo.service";
import {
  addHomepageSlideshowPhoto,
  HomepageSlideshowError,
  publicHomepageSlideshow,
  reorderHomepageSlideshow,
} from "@/server/services/homepage-slideshow.service";

export const runtime = "nodejs";

async function readPhoto(request: Request): Promise<{ bytes: Buffer } | { error: NextResponse }> {
  const reader = request.body?.getReader();
  if (!reader) return { error: NextResponse.json({ error: "Choose a photo." }, { status: 400 }) };
  let total = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.length;
      if (total > MAX_HOMEPAGE_UPLOAD) {
        await reader.cancel();
        return { error: NextResponse.json({ error: "Choose a photo smaller than 12 MB." }, { status: 413 }) };
      }
      chunks.push(part.value);
    }
    return { bytes: Buffer.concat(chunks) };
  } finally {
    reader.releaseLock();
  }
}

function denied(request: Request) {
  return !request.headers.get("origin") || !isAllowedCheckoutRequestOrigin(request);
}

export async function GET() {
  const photos = await publicHomepageSlideshow();
  return NextResponse.json({ photos });
}

export async function POST(request: Request) {
  if (denied(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  if (!await homepagePhotoAdmin()) {
    return NextResponse.json({ error: "Only this church's administrator can change the slideshow." }, { status: 403 });
  }
  const action = request.headers.get("x-slideshow-action");
  try {
    if (action === "reorder") {
      const body = await request.json().catch(() => null) as { ids?: unknown } | null;
      if (!body || !Array.isArray(body.ids) || body.ids.some((id) => typeof id !== "string")) {
        return NextResponse.json({ error: "Refresh the slideshow before reordering." }, { status: 400 });
      }
      await reorderHomepageSlideshow(body.ids);
      revalidatePath("/");
      return NextResponse.json({ ok: true });
    }
    const photo = await readPhoto(request);
    if ("error" in photo) return photo.error;
    let prepared;
    try {
      prepared = await prepareHomepagePhoto(photo.bytes, decodeURIComponent(request.headers.get("x-photo-description") ?? ""));
    } catch {
      return NextResponse.json({ error: "Choose a still JPEG, PNG, or WebP under 12 MB, and add a description (1–200 characters)." }, { status: 400 });
    }
    const saved = await addHomepageSlideshowPhoto(prepared);
    revalidatePath("/");
    return NextResponse.json(saved);
  } catch (error) {
    if (error instanceof HomepageSlideshowError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "The slideshow photo could not be saved. Try again." }, { status: 503 });
  }
}
