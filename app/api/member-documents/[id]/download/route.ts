import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { Readable } from "node:stream";

import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { getProtectedMemberDocumentDownload } from "@/server/services/member-engagement.service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const userAccount = await getOrCreateUserAccount();
  const clerkUser = await currentUser();

  try {
    const download = await getProtectedMemberDocumentDownload(id, {
      userAccountId: userAccount?.id ?? null,
      email:
        clerkUser?.primaryEmailAddress?.emailAddress ??
        userAccount?.primaryEmail ??
        null,
    });

    try {
      await access(download.absolutePath);
    } catch {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }

    const stream = createReadStream(download.absolutePath);
    const webStream = Readable.toWeb(stream) as ReadableStream;

    return new NextResponse(webStream, {
      headers: {
        "Content-Type": download.mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${download.fileName.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to download document.";
    const status = message.toLowerCase().includes("permission") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
