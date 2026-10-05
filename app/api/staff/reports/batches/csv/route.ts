import { NextResponse } from "next/server";

import {
  BatchReconciliationReportError,
  exportBatchReconciliationReportCsv,
} from "@/server/services/batch-reconciliation-report.service";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  try {
    const exported = await exportBatchReconciliationReportCsv(raw);
    return new NextResponse(exported.csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exported.filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message =
      error instanceof BatchReconciliationReportError
        ? error.message
        : "Unable to export the batch reconciliation report.";
    const status = message.startsWith("Sign in")
      ? 401
      : /permission/i.test(message)
        ? 403
        : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
