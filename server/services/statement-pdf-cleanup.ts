import { prisma } from "@/lib/db/prisma";
import { deletePrivateStatementPdf } from "@/lib/storage/statement-pdf";

export async function deleteUnreferencedPrivateStatementPdf(input: {
  organizationId: string;
  statementId: string;
  storageKey: string;
}) {
  const referenced = await prisma.contributionStatement.findUnique({
    where: { id: input.statementId },
    select: { organizationId: true, pdfStorageKey: true },
  });
  if (
    referenced?.organizationId === input.organizationId &&
    referenced.pdfStorageKey === input.storageKey
  ) {
    return;
  }
  await deletePrivateStatementPdf(input);
}
