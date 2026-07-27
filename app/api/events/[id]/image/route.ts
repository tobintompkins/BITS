import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { Readable } from "node:stream";

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { getProtectedEventImage } from "@/server/services/event.service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const download = await getProtectedEventImage(id);

    try {
      await access(download.absolutePath);
    } catch {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }

    const stream = createReadStream(download.absolutePath);
    const webStream = Readable.toWeb(stream) as ReadableStream;

    return new NextResponse(webStream, {
      headers: {
        "Content-Type": download.mimeType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load image.";
    const lower = message.toLowerCase();
    const status = lower.includes("permission") || lower.includes("not found")
      ? lower.includes("permission")
        ? 403
        : 404
      : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
