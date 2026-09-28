import Link from "next/link";
import { redirect } from "next/navigation";

import {
  MEMBER_MINISTRY_RESOURCE_EMPTY_COPY,
  MEMBER_MINISTRY_RESOURCE_NOTICE,
  MEMBER_MINISTRY_RESOURCE_PENDING_COPY,
  ministryResourceLinkProps,
} from "@/lib/validation/ministry-resource";
import { getMemberMinistryResources } from "@/server/services/ministry-resource.service";

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

export default async function MemberMinistryResourcesPage() {
  const portal = await getMemberMinistryResources();
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
          My Ministry Resources
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--bits-muted)]">
          {MEMBER_MINISTRY_RESOURCE_PENDING_COPY}
        </p>
        <p className="mt-4">
          <Link
            href="/portal/help"
            className={`text-sm font-semibold text-[var(--bits-navy)] underline ${focusClass}`}
          >
            Help &amp; Contact
          </Link>
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
            My Ministry Resources
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
            {MEMBER_MINISTRY_RESOURCE_NOTICE}{" "}
            <Link
              href="/portal/help"
              className={`font-semibold text-[var(--bits-navy)] underline ${focusClass}`}
            >
              Help &amp; Contact
            </Link>
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
          Published resources
        </h2>
        {portal.groups.length === 0 ? (
          <p className="mt-4 text-sm leading-6 text-[var(--bits-muted)]">
            {MEMBER_MINISTRY_RESOURCE_EMPTY_COPY}{" "}
            <Link
              href="/portal/help"
              className={`font-semibold text-[var(--bits-navy)] underline ${focusClass}`}
            >
              Help &amp; Contact
            </Link>
          </p>
        ) : (
          <div className="mt-4 grid gap-6">
            {portal.groups.map((group) => (
              <section key={group.ministryName}>
                <h3 className="text-lg font-semibold text-[var(--bits-navy)]">
                  {group.ministryName}
                </h3>
                <ul className="mt-3 grid gap-3">
                  {group.resources.map((row) => {
                    const link = ministryResourceLinkProps(row.url);
                    if (!link) return null;
                    return (
                      <li
                        key={`${group.ministryName}-${row.title}-${row.url}`}
                        className="rounded-xl border border-[var(--bits-border)] p-4"
                      >
                        <p className="font-semibold text-[var(--bits-navy)]">
                          {row.title}
                        </p>
                        {row.description ? (
                          <p className="mt-1 text-sm leading-6 text-[var(--bits-muted)]">
                            {row.description}
                          </p>
                        ) : null}
                        <p className="mt-3">
                          <a
                            href={link.href}
                            target={link.target}
                            rel={link.rel}
                            className={`text-sm font-semibold text-[var(--bits-navy)] underline ${focusClass}`}
                          >
                            Open resource
                            <span className="sr-only"> {row.title}</span>
                          </a>
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
