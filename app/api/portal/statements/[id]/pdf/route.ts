import { Readable } from "node:stream";

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import {
  openAuthorizedStatementPdf,
  sanitizeStatementPdfFileName,
} from "@/lib/storage/statement-pdf";
import {
  authorizePortalStatementPdf,
  recordPortalStatementAccess,
} from "@/server/services/member-portal-statement-pdf.service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const NOT_FOUND_BODY = { error: "Not found" };

function notFound() {
  return NextResponse.json(NOT_FOUND_BODY, { status: 404 });
}

/**
 * GET /api/portal/statements/{id}/pdf?mode=view|download
 *
 * Streams an ownership-scoped published individual or household statement PDF.
 * Never returns a storage key or filesystem path.
 */
export async function GET(request: Request, context: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const mode = new URL(request.url).searchParams.get("mode") ?? "";
  const authorized = await authorizePortalStatementPdf(id, mode);

  if (authorized.status === "SIGNED_OUT") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (authorized.status === "INVALID_REQUEST") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (authorized.status !== "AUTHORIZED") {
    return notFound();
  }

  const opened = await openAuthorizedStatementPdf({
    organizationId: authorized.organizationId,
    statementId: authorized.statementId,
    storageKey: authorized.pdfStorageKey,
    checksum: authorized.pdfChecksum,
  });

  if (!opened.ok) {
    return notFound();
  }

  try {
    await recordPortalStatementAccess({
      organizationId: authorized.organizationId,
      statementId: authorized.statementId,
      userAccountId: authorized.userAccountId,
      mode: authorized.mode,
    });
  } catch {
    opened.stream.destroy();
    return NextResponse.json(
      { error: "Unable to open statement." },
      { status: 500 },
    );
  }

  const fileName = sanitizeStatementPdfFileName(authorized.statementIdentifier);
  const disposition =
    authorized.mode === "view"
      ? `inline; filename="${fileName}"`
      : `attachment; filename="${fileName}"`;

  const webStream = Readable.toWeb(opened.stream) as ReadableStream;

  return new NextResponse(webStream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": disposition,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
