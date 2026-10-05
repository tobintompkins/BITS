import { NextResponse } from "next/server";

import {
  ContributionReportError,
  exportContributionReportCsv,
} from "@/server/services/contribution-report.service";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  try {
    const exported = await exportContributionReportCsv(raw);
    return new NextResponse(exported.csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exported.filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const status =
      error instanceof ContributionReportError &&
      /permission|Sign in/i.test(error.message)
        ? 403
        : 400;
    return NextResponse.json(
      {
        error:
          error instanceof ContributionReportError
            ? error.message
            : "Unable to export the contribution report.",
      },
      { status: error instanceof ContributionReportError && error.message.startsWith("Sign in") ? 401 : status },
    );
  }
}
