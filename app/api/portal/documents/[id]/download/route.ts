import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { Readable } from "node:stream";

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { getMemberSafeDocumentDownload } from "@/server/services/member-safe-documents.service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const NOT_FOUND_BODY = { error: "Not found" };

function notFound() {
  return NextResponse.json(NOT_FOUND_BODY, { status: 404 });
}

/**
 * GET /api/portal/documents/{id}/download
 *
 * Streams one ownership-scoped safe document for the signed-in linked member.
 * Organization and member are resolved server-side. A document id alone never
 * grants access, and forbidden documents return the same 404 as missing ones.
 */
export async function GET(_request: Request, context: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const result = await getMemberSafeDocumentDownload(id);

  if (result.status === "SIGNED_OUT") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (result.status !== "READY") {
    return notFound();
  }

  try {
    await access(result.absolutePath);
  } catch {
    return notFound();
  }

  const stream = createReadStream(result.absolutePath);
  const webStream = Readable.toWeb(stream) as ReadableStream;
  const fileName = result.fileName.replace(/"/g, "");

  return new NextResponse(webStream, {
    headers: {
      "Content-Type": result.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
