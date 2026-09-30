import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  MEMBER_SAFE_DOCUMENTS_EMPTY_COPY,
  MEMBER_SAFE_DOCUMENTS_NOTICE,
  MEMBER_SAFE_DOCUMENTS_PENDING_COPY,
} from "@/lib/validation/member-safe-documents";
import { getMemberSafeDocuments } from "@/server/services/member-safe-documents.service";

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

function HelpLink({ children }: { children: ReactNode }) {
  return (
    <Link
      href="/portal/help"
      className={`font-semibold text-[var(--bits-navy)] underline ${focusClass}`}
    >
      {children}
    </Link>
  );
}

export default async function MemberSafeDocumentsPage() {
  const portal = await getMemberSafeDocuments();
  if (portal.status === "SIGNED_OUT") redirect("/sign-in");

  if (portal.status === "NO_ORGANIZATION") {
    return (
      <p className="rounded-xl bg-white p-5 text-sm">
        The church organization has not been configured.
      </p>
    );
  }

  if (portal.status === "CONNECTION_PENDING") {
    return (
      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-[var(--bits-navy)]">
          My Documents
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--bits-muted)]">
          {MEMBER_SAFE_DOCUMENTS_PENDING_COPY}
        </p>
        <p className="mt-4">
          <HelpLink>Help &amp; Contact</HelpLink>
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
            Private Member Access
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
            My Documents
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
            {MEMBER_SAFE_DOCUMENTS_NOTICE}
          </p>
        </div>
        <Link
          href="/portal"
          className={`text-sm font-medium text-[var(--bits-navy)] underline ${focusClass}`}
        >
          Member Portal Home
        </Link>
      </header>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Assigned documents
        </h2>
        {portal.rows.length === 0 ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm leading-6 text-[var(--bits-muted)]">
              {MEMBER_SAFE_DOCUMENTS_EMPTY_COPY}{" "}
              <HelpLink>Help &amp; Contact</HelpLink>
            </p>
          </div>
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {portal.rows.map((row) => (
              <li
                key={row.id}
                className="flex flex-col rounded-xl border border-[var(--bits-border)] bg-[var(--bits-page)] p-4"
              >
                <h3 className="text-lg font-semibold text-[var(--bits-navy)]">
                  {row.title}
                </h3>
                <p className="mt-1 text-sm font-medium text-[var(--bits-gold)]">
                  {row.typeLabel}
                </p>
                {row.description ? (
                  <p className="mt-2 text-sm leading-6 text-[var(--bits-muted)]">
                    {row.description}
                  </p>
                ) : null}
                <dl className="mt-3 space-y-1 text-sm text-[var(--bits-navy)]">
                  <div>
                    <dt className="inline text-[var(--bits-muted)]">File: </dt>
                    <dd className="inline">{row.fileName}</dd>
                  </div>
                  <div>
                    <dt className="inline text-[var(--bits-muted)]">
                      Date added:{" "}
                    </dt>
                    <dd className="inline">{row.createdOnLabel}</dd>
                  </div>
                  {row.expiresOnLabel ? (
                    <div>
                      <dt className="inline text-[var(--bits-muted)]">
                        Expires:{" "}
                      </dt>
                      <dd className="inline">{row.expiresOnLabel}</dd>
                    </div>
                  ) : null}
                </dl>
                <p className="mt-4">
                  <a
                    href={`/api/portal/documents/${row.id}/download`}
                    className={`inline-flex rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white ${focusClass}`}
                  >
                    Download
                  </a>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
