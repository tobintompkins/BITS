import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  AppShellNav,
  type NavGroup,
} from "@/components/layout/app-shell-nav";
import { getCareAccess } from "@/lib/auth/care-permissions";
import { getEventAccess } from "@/lib/auth/event-permissions";
import { getMemberEngagementAccess } from "@/lib/auth/member-engagement-permissions";
import { getMemberLifecycleAccess } from "@/lib/auth/member-lifecycle-permissions";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export default async function StaffLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const organization = await findPrimaryOrganization();
  const careAccess = organization
    ? await getCareAccess(organization.id)
    : null;
  const engagementAccess = organization
    ? await getMemberEngagementAccess(organization.id)
    : null;
  const lifecycleAccess = organization
    ? await getMemberLifecycleAccess(organization.id)
    : null;
  const eventAccess = organization
    ? await getEventAccess(organization.id)
    : null;

  const navGroups: NavGroup[] = [
    {
      label: "Home",
      items: [{ href: "/dashboard", label: "Leadership Home" }],
    },
    {
      label: "People",
      items: [
        { href: "/members", label: "Members" },
        { href: "/households", label: "Households" },
        ...(engagementAccess?.canViewSkillsInterests
          ? [{ href: "/members/skills", label: "Member Skills" }]
          : []),
        ...(lifecycleAccess?.canViewArchived
          ? [{ href: "/members?recordStatus=ARCHIVED", label: "Archived Members" }]
          : []),
        ...(lifecycleAccess?.canReviewDuplicates
          ? [{ href: "/members/duplicates", label: "Duplicate Review" }]
          : []),
      ],
    },
    {
      label: "Ministry",
      items: engagementAccess?.canViewMinistries
        ? [{ href: "/ministries", label: "Ministries" }]
        : [],
    },
    {
      label: "Pastoral Care",
      items: [
        ...(careAccess?.canViewPrayerRequests
          ? [{ href: "/prayer-requests", label: "Prayer Requests" }]
          : []),
        ...(careAccess?.canViewFollowUps
          ? [{ href: "/follow-ups", label: "Follow-Ups" }]
          : []),
        ...(careAccess?.canViewPastoralCare
          ? [{ href: "/pastoral-care", label: "Pastoral Care" }]
          : []),
      ],
    },
    {
      label: "Church Life",
      items: [
        ...(eventAccess?.canView
          ? [
              { href: "/events", label: "Events" },
              { href: "/events/calendar", label: "Calendar" },
            ]
          : []),
        ...(careAccess?.canViewAttendance
          ? [{ href: "/attendance", label: "Attendance" }]
          : []),
      ],
    },
    {
      label: "Giving",
      items: [
        { href: "/donors", label: "Donors" },
        { href: "/batches", label: "Batches" },
        { href: "/statements", label: "Statements" },
      ],
    },
    {
      label: "Reports",
      items: [{ href: "/reports", label: "Reports" }],
    },
    {
      label: "Administration",
      items: [
        { href: "/settings/organization", label: "Organization Settings" },
        ...(engagementAccess?.canManageSpiritualGiftCatalog ||
        engagementAccess?.canViewSpiritualGifts
          ? [{ href: "/settings/spiritual-gifts", label: "Spiritual Gifts" }]
          : []),
        ...(eventAccess?.canManageCategories
          ? [{ href: "/settings/event-categories", label: "Event Categories" }]
          : []),
        ...(eventAccess?.canManageLocations
          ? [{ href: "/settings/event-locations", label: "Event Locations" }]
          : []),
      ],
    },
  ];

  return (
    <div className="min-h-full bg-[var(--bits-page)]">
      <header className="border-b-4 border-[var(--bits-gold)] bg-[var(--bits-navy)] text-white shadow-sm">
        <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--bits-gold)]">
              BITS · Leadership Portal
            </p>
            <h1 className="text-lg font-semibold text-white">
              Bring In The Sheaves
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="hidden text-sm font-medium text-white/85 underline-offset-4 hover:text-white hover:underline sm:inline"
            >
              Public site
            </Link>
            <UserButton />
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1440px] gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:px-8">
        <aside className="h-fit lg:sticky lg:top-5">
          <div className="hidden rounded-2xl bg-[var(--bits-navy-deep)] p-4 shadow-lg lg:block">
            <p className="mb-3 px-3 text-xs leading-5 text-white/60">
              Secure access for authorized church leadership.
            </p>
            <AppShellNav groups={navGroups} />
          </div>
          <div className="lg:hidden">
            <AppShellNav groups={navGroups} />
          </div>
        </aside>

        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
