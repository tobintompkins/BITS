import { Readable } from "node:stream";

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import {
  openAuthorizedStatementPdf,
  sanitizeStatementPdfFileName,
} from "@/lib/storage/statement-pdf";
import {
  authorizeStaffGeneratedStatementPdf,
  recordStaffGeneratedStatementView,
} from "@/server/services/staff-generated-statement-pdf.service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const NOT_FOUND_BODY = { error: "Not found" };

function notFound() {
  return NextResponse.json(NOT_FOUND_BODY, { status: 404 });
}

/**
 * GET /api/staff/statements/{id}/pdf
 *
 * Streams a current-organization INDIVIDUAL statement PDF with status
 * GENERATED. Never returns a storage key, filesystem path, or checksum.
 */
export async function GET(_request: Request, context: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const authorized = await authorizeStaffGeneratedStatementPdf(id);

  if (authorized.status === "SIGNED_OUT") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    await recordStaffGeneratedStatementView({
      organizationId: authorized.organizationId,
      statementId: authorized.statementId,
      userAccountId: authorized.userAccountId,
      statementIdentifier: authorized.statementIdentifier,
    });
  } catch {
    opened.stream.destroy();
    return NextResponse.json(
      { error: "Unable to open statement." },
      { status: 500 },
    );
  }

  const fileName = sanitizeStatementPdfFileName(authorized.statementIdentifier);
  const webStream = Readable.toWeb(opened.stream) as ReadableStream;

  return new NextResponse(webStream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
