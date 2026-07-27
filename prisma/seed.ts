import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  RoleCode,
  MembershipStatus,
  HouseholdRelationship,
  AttendanceType,
  FollowUpType,
  FollowUpStatus,
  FollowUpPriority,
  PastoralCareCategory,
  PrayerRequestStatus,
  PrayerPrivacyLevel,
  CommunicationType,
  CommunicationDirection,
  MembershipMilestoneType,
  GiftProficiencyLevel,
  MinistryType,
  MemberMinistryRole,
  MemberMinistryStatus,
  SkillProficiencyLevel,
  MemberDocumentType,
  MemberRecordStatus,
  PreferredContactMethod,
  MemberConsentType,
  ConsentChangeSource,
  DuplicateCandidateStatus,
  EventStatus,
  EventVisibility,
  EventOrganizerRole,
} from "../app/generated/prisma/client";
import { DEFAULT_SPIRITUAL_GIFTS } from "../lib/constants/member-engagement";
import {
  DEFAULT_EVENT_CATEGORIES,
  DEFAULT_EVENT_LOCATIONS,
} from "../lib/constants/events";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to run the seed script.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const roleDefinitions: Array<{ code: RoleCode; name: string }> = [
    { code: RoleCode.ORG_ADMIN, name: "Organization Admin" },
    { code: RoleCode.TREASURER, name: "Treasurer" },
    { code: RoleCode.DATA_ENTRY, name: "Data Entry" },
    { code: RoleCode.REPORT_VIEWER, name: "Report Viewer" },
    { code: RoleCode.DONOR, name: "Donor" },
  ];

  for (const role of roleDefinitions) {
    await prisma.roleType.upsert({
      where: { code: role.code },
      update: { name: role.name },
      create: role,
    });
  }

  const demoOrganization = await prisma.organization.upsert({
    where: { slug: "demo-community-church" },
    update: {
      name: "Demo Community Church",
      displayName: "Demo Community",
      ein: "12-3456789",
      mailingAddressLine1: "100 Main Street",
      mailingAddressLine2: "Suite 200",
      city: "Nashville",
      state: "TN",
      postalCode: "37203",
      country: "US",
      contactPhone: "(615) 555-0100",
      contactEmail: "office@demochurch.org",
      websiteUrl: "https://demochurch.org",
      statementFooterText:
        "No goods or services were provided in exchange for these contributions, other than intangible religious benefits, if applicable.",
      timeZone: "America/Chicago",
      locale: "en-US",
      active: true,
    },
    create: {
      name: "Demo Community Church",
      displayName: "Demo Community",
      slug: "demo-community-church",
      ein: "12-3456789",
      mailingAddressLine1: "100 Main Street",
      mailingAddressLine2: "Suite 200",
      city: "Nashville",
      state: "TN",
      postalCode: "37203",
      country: "US",
      contactPhone: "(615) 555-0100",
      contactEmail: "office@demochurch.org",
      websiteUrl: "https://demochurch.org",
      statementFooterText:
        "No goods or services were provided in exchange for these contributions, other than intangible religious benefits, if applicable.",
      timeZone: "America/Chicago",
      locale: "en-US",
      active: true,
    },
  });

  const demoAdmin = await prisma.userAccount.upsert({
    where: { clerkUserId: "seed_demo_admin" },
    update: {
      primaryEmail: "admin@demochurch.org",
      displayName: "Demo Admin",
      active: true,
    },
    create: {
      clerkUserId: "seed_demo_admin",
      primaryEmail: "admin@demochurch.org",
      displayName: "Demo Admin",
      active: true,
    },
  });

  const orgAdminRole = await prisma.roleType.findUniqueOrThrow({
    where: { code: RoleCode.ORG_ADMIN },
  });

  await prisma.organizationMembership.upsert({
    where: {
      organizationId_userAccountId: {
        organizationId: demoOrganization.id,
        userAccountId: demoAdmin.id,
      },
    },
    update: {
      roleTypeId: orgAdminRole.id,
      active: true,
    },
    create: {
      organizationId: demoOrganization.id,
      userAccountId: demoAdmin.id,
      roleTypeId: orgAdminRole.id,
      active: true,
    },
  });

  console.log("Seeded demo organization:", demoOrganization.slug);

  const smithHousehold = await prisma.memberHouseholdUnit.upsert({
    where: { id: "00000000-0000-4000-8000-000000000101" },
    update: {
      organizationId: demoOrganization.id,
      householdName: "Smith Family",
      addressLine1: "201 Oak Street",
      city: "Nashville",
      state: "TN",
      postalCode: "37206",
      country: "US",
    },
    create: {
      id: "00000000-0000-4000-8000-000000000101",
      organizationId: demoOrganization.id,
      householdName: "Smith Family",
      addressLine1: "201 Oak Street",
      city: "Nashville",
      state: "TN",
      postalCode: "37206",
      country: "US",
    },
  });

  const johnsonHousehold = await prisma.memberHouseholdUnit.upsert({
    where: { id: "00000000-0000-4000-8000-000000000102" },
    update: {
      organizationId: demoOrganization.id,
      householdName: "Johnson Family",
      addressLine1: "88 Pine Avenue",
      city: "Nashville",
      state: "TN",
      postalCode: "37209",
      country: "US",
    },
    create: {
      id: "00000000-0000-4000-8000-000000000102",
      organizationId: demoOrganization.id,
      householdName: "Johnson Family",
      addressLine1: "88 Pine Avenue",
      city: "Nashville",
      state: "TN",
      postalCode: "37209",
      country: "US",
    },
  });

  const williamsHousehold = await prisma.memberHouseholdUnit.upsert({
    where: { id: "00000000-0000-4000-8000-000000000103" },
    update: {
      organizationId: demoOrganization.id,
      householdName: "Williams Family",
      addressLine1: "45 Maple Drive",
      city: "Franklin",
      state: "TN",
      postalCode: "37064",
      country: "US",
    },
    create: {
      id: "00000000-0000-4000-8000-000000000103",
      organizationId: demoOrganization.id,
      householdName: "Williams Family",
      addressLine1: "45 Maple Drive",
      city: "Franklin",
      state: "TN",
      postalCode: "37064",
      country: "US",
    },
  });

  const demoMembers = [
    {
      id: "00000000-0000-4000-8000-000000000201",
      firstName: "Alex",
      lastName: "Rivera",
      email: "alex.rivera@example.org",
      phone: "(615) 555-1001",
      membershipStatus: MembershipStatus.VISITOR,
      householdId: null,
      relationship: null,
    },
    {
      id: "00000000-0000-4000-8000-000000000202",
      firstName: "Jordan",
      lastName: "Lee",
      email: "jordan.lee@example.org",
      phone: "(615) 555-1002",
      membershipStatus: MembershipStatus.REGULAR_ATTENDER,
      householdId: null,
      relationship: null,
    },
    {
      id: "00000000-0000-4000-8000-000000000203",
      firstName: "Morgan",
      lastName: "Smith",
      email: "morgan.smith@example.org",
      phone: "(615) 555-1003",
      membershipStatus: MembershipStatus.MEMBER,
      householdId: smithHousehold.id,
      relationship: HouseholdRelationship.SELF,
    },
    {
      id: "00000000-0000-4000-8000-000000000204",
      firstName: "Taylor",
      lastName: "Smith",
      email: "taylor.smith@example.org",
      phone: "(615) 555-1004",
      membershipStatus: MembershipStatus.MEMBER,
      householdId: smithHousehold.id,
      relationship: HouseholdRelationship.SPOUSE,
    },
    {
      id: "00000000-0000-4000-8000-000000000205",
      firstName: "Casey",
      lastName: "Nguyen",
      email: "casey.nguyen@example.org",
      phone: "(615) 555-1005",
      membershipStatus: MembershipStatus.INACTIVE,
      householdId: johnsonHousehold.id,
      relationship: HouseholdRelationship.SELF,
    },
    {
      id: "00000000-0000-4000-8000-000000000206",
      firstName: "Riley",
      lastName: "Johnson",
      email: "riley.johnson@example.org",
      phone: "(615) 555-1006",
      membershipStatus: MembershipStatus.MEMBER,
      householdId: johnsonHousehold.id,
      relationship: HouseholdRelationship.SPOUSE,
    },
    {
      id: "00000000-0000-4000-8000-000000000207",
      firstName: "Sam",
      lastName: "Williams",
      email: "sam.williams@example.org",
      phone: "(615) 555-1007",
      membershipStatus: MembershipStatus.MEMBER,
      householdId: williamsHousehold.id,
      relationship: HouseholdRelationship.SELF,
    },
    {
      id: "00000000-0000-4000-8000-000000000208",
      firstName: "Pat",
      lastName: "Williams",
      email: "pat.williams@example.org",
      phone: "(615) 555-1008",
      membershipStatus: MembershipStatus.REGULAR_ATTENDER,
      householdId: williamsHousehold.id,
      relationship: HouseholdRelationship.CHILD,
    },
    {
      id: "00000000-0000-4000-8000-000000000209",
      firstName: "Quinn",
      lastName: "Brooks",
      email: "quinn.brooks@example.org",
      phone: "(615) 555-1009",
      membershipStatus: MembershipStatus.VISITOR,
      householdId: null,
      relationship: null,
    },
  ] as const;

  const photoPlaceholders: Record<string, string> = {
    "00000000-0000-4000-8000-000000000203":
      "https://placehold.co/200x200/1f2937/ffffff/png?text=MS",
    "00000000-0000-4000-8000-000000000204":
      "https://placehold.co/200x200/334155/ffffff/png?text=TS",
    "00000000-0000-4000-8000-000000000207":
      "https://placehold.co/200x200/0f766e/ffffff/png?text=SW",
    "00000000-0000-4000-8000-000000000201":
      "https://placehold.co/200x200/7c3aed/ffffff/png?text=AR",
  };

  for (const member of demoMembers) {
    const savedMember = await prisma.member.upsert({
      where: { id: member.id },
      update: {
        organizationId: demoOrganization.id,
        firstName: member.firstName,
        lastName: member.lastName,
        email: member.email,
        phone: member.phone,
        membershipStatus: member.membershipStatus,
        profilePhotoUrl: photoPlaceholders[member.id] ?? null,
        addressLine1: "100 Main Street",
        city: "Nashville",
        state: "TN",
        postalCode: "37203",
        country: "US",
      },
      create: {
        id: member.id,
        organizationId: demoOrganization.id,
        firstName: member.firstName,
        lastName: member.lastName,
        email: member.email,
        phone: member.phone,
        membershipStatus: member.membershipStatus,
        profilePhotoUrl: photoPlaceholders[member.id] ?? null,
        addressLine1: "100 Main Street",
        city: "Nashville",
        state: "TN",
        postalCode: "37203",
        country: "US",
      },
    });

    await prisma.memberHousehold.deleteMany({
      where: { memberId: savedMember.id },
    });

    if (member.householdId) {
      await prisma.memberHousehold.create({
        data: {
          organizationId: demoOrganization.id,
          memberId: savedMember.id,
          householdId: member.householdId,
          relationshipToHousehold: member.relationship,
          isPrimaryContact:
            member.relationship === HouseholdRelationship.SELF &&
            savedMember.id ===
              (member.householdId === smithHousehold.id
                ? "00000000-0000-4000-8000-000000000203"
                : member.householdId === johnsonHousehold.id
                  ? "00000000-0000-4000-8000-000000000205"
                  : "00000000-0000-4000-8000-000000000207"),
        },
      });
    }
  }

  await prisma.memberHouseholdUnit.update({
    where: { id: smithHousehold.id },
    data: { primaryContactId: "00000000-0000-4000-8000-000000000203" },
  });

  await prisma.memberHouseholdUnit.update({
    where: { id: johnsonHousehold.id },
    data: { primaryContactId: "00000000-0000-4000-8000-000000000205" },
  });

  await prisma.memberHouseholdUnit.update({
    where: { id: williamsHousehold.id },
    data: { primaryContactId: "00000000-0000-4000-8000-000000000207" },
  });

  const emergencyContacts = [
    {
      id: "00000000-0000-4000-8000-000000000301",
      memberId: "00000000-0000-4000-8000-000000000203",
      name: "Taylor Smith",
      relationship: "Spouse",
      phone: "(615) 555-1004",
      email: "taylor.smith@example.org",
      isPrimary: true,
      notes: "Primary emergency contact",
    },
    {
      id: "00000000-0000-4000-8000-000000000302",
      memberId: "00000000-0000-4000-8000-000000000203",
      name: "Dana Smith",
      relationship: "Parent",
      phone: "(615) 555-1100",
      email: "dana.smith@example.org",
      isPrimary: false,
      notes: null,
    },
    {
      id: "00000000-0000-4000-8000-000000000303",
      memberId: "00000000-0000-4000-8000-000000000207",
      name: "Pat Williams",
      relationship: "Spouse",
      phone: "(615) 555-1008",
      email: "pat.williams@example.org",
      isPrimary: true,
      notes: null,
    },
    {
      id: "00000000-0000-4000-8000-000000000304",
      memberId: "00000000-0000-4000-8000-000000000207",
      name: "Chris Williams",
      relationship: "Sibling",
      phone: "(615) 555-1101",
      email: null,
      isPrimary: false,
      notes: "Lives nearby",
    },
    {
      id: "00000000-0000-4000-8000-000000000305",
      memberId: "00000000-0000-4000-8000-000000000201",
      name: "Maria Rivera",
      relationship: "Parent",
      phone: "(615) 555-1102",
      email: "maria.rivera@example.org",
      isPrimary: true,
      notes: null,
    },
    {
      id: "00000000-0000-4000-8000-000000000306",
      memberId: "00000000-0000-4000-8000-000000000205",
      name: "Riley Johnson",
      relationship: "Spouse",
      phone: "(615) 555-1006",
      email: "riley.johnson@example.org",
      isPrimary: true,
      notes: null,
    },
  ] as const;

  for (const contact of emergencyContacts) {
    await prisma.memberEmergencyContact.upsert({
      where: { id: contact.id },
      update: contact,
      create: contact,
    });
  }

  const services = ["Sunday Morning", "Sunday Evening", "Wednesday Night", "Youth Service"];
  const memberIds = [
    "00000000-0000-4000-8000-000000000201",
    "00000000-0000-4000-8000-000000000202",
    "00000000-0000-4000-8000-000000000203",
    "00000000-0000-4000-8000-000000000204",
    "00000000-0000-4000-8000-000000000205",
    "00000000-0000-4000-8000-000000000206",
    "00000000-0000-4000-8000-000000000207",
    "00000000-0000-4000-8000-000000000208",
  ];

  for (let index = 0; index < 20; index += 1) {
    const id = `00000000-0000-4000-8000-0000000004${String(index + 1).padStart(2, "0")}`;
    const attendanceDate = new Date(Date.UTC(2026, 5, 1 + index));
    await prisma.memberAttendance.upsert({
      where: { id },
      update: {
        organizationId: demoOrganization.id,
        memberId: memberIds[index % memberIds.length],
        attendanceDate,
        serviceName: services[index % services.length],
        attendanceType:
          index % 5 === 0
            ? AttendanceType.ONLINE
            : index % 7 === 0
              ? AttendanceType.ABSENT
              : AttendanceType.PRESENT,
        checkedInByUserId: demoAdmin.id,
        notes: index % 4 === 0 ? "Seed attendance note" : null,
      },
      create: {
        id,
        organizationId: demoOrganization.id,
        memberId: memberIds[index % memberIds.length],
        attendanceDate,
        serviceName: services[index % services.length],
        attendanceType:
          index % 5 === 0
            ? AttendanceType.ONLINE
            : index % 7 === 0
              ? AttendanceType.ABSENT
              : AttendanceType.PRESENT,
        checkedInByUserId: demoAdmin.id,
        notes: index % 4 === 0 ? "Seed attendance note" : null,
      },
    });
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const overdueDate = new Date(today);
  overdueDate.setUTCDate(overdueDate.getUTCDate() - 5);
  const overdueDate2 = new Date(today);
  overdueDate2.setUTCDate(overdueDate2.getUTCDate() - 10);

  const followUps = [
    {
      id: "00000000-0000-4000-8000-000000000501",
      memberId: "00000000-0000-4000-8000-000000000201",
      followUpType: FollowUpType.VISITOR_WELCOME,
      status: FollowUpStatus.OPEN,
      priority: FollowUpPriority.HIGH,
      dueDate: overdueDate,
      subject: "Welcome call for Alex Rivera",
      notes: "First-time visitor follow-up",
      completedAt: null as Date | null,
      outcome: null as string | null,
    },
    {
      id: "00000000-0000-4000-8000-000000000502",
      memberId: "00000000-0000-4000-8000-000000000209",
      followUpType: FollowUpType.PHONE_CALL,
      status: FollowUpStatus.OVERDUE,
      priority: FollowUpPriority.URGENT,
      dueDate: overdueDate2,
      subject: "Overdue visitor phone call",
      notes: null,
      completedAt: null,
      outcome: null,
    },
    {
      id: "00000000-0000-4000-8000-000000000503",
      memberId: "00000000-0000-4000-8000-000000000202",
      followUpType: FollowUpType.EMAIL,
      status: FollowUpStatus.IN_PROGRESS,
      priority: FollowUpPriority.NORMAL,
      dueDate: today,
      subject: "Send welcome email",
      notes: null,
      completedAt: null,
      outcome: null,
    },
    {
      id: "00000000-0000-4000-8000-000000000504",
      memberId: "00000000-0000-4000-8000-000000000203",
      followUpType: FollowUpType.MEMBERSHIP_FOLLOW_UP,
      status: FollowUpStatus.COMPLETED,
      priority: FollowUpPriority.NORMAL,
      dueDate: new Date(Date.UTC(2026, 4, 1)),
      subject: "Membership class invite",
      notes: null,
      completedAt: new Date(Date.UTC(2026, 4, 3)),
      outcome: "Joined membership class",
    },
    {
      id: "00000000-0000-4000-8000-000000000505",
      memberId: "00000000-0000-4000-8000-000000000205",
      followUpType: FollowUpType.HOME_VISIT,
      status: FollowUpStatus.COMPLETED,
      priority: FollowUpPriority.HIGH,
      dueDate: new Date(Date.UTC(2026, 3, 15)),
      subject: "Home visit completed",
      notes: null,
      completedAt: new Date(Date.UTC(2026, 3, 16)),
      outcome: "Encouraging visit",
    },
    {
      id: "00000000-0000-4000-8000-000000000506",
      memberId: "00000000-0000-4000-8000-000000000207",
      followUpType: FollowUpType.BAPTISM_FOLLOW_UP,
      status: FollowUpStatus.COMPLETED,
      priority: FollowUpPriority.NORMAL,
      dueDate: new Date(Date.UTC(2026, 2, 10)),
      subject: "Baptism preparation",
      notes: null,
      completedAt: new Date(Date.UTC(2026, 2, 12)),
      outcome: "Scheduled baptism",
    },
  ];

  for (const followUp of followUps) {
    await prisma.memberFollowUp.upsert({
      where: { id: followUp.id },
      update: {
        organizationId: demoOrganization.id,
        ...followUp,
        assignedToUserId: demoAdmin.id,
        createdByUserId: demoAdmin.id,
      },
      create: {
        organizationId: demoOrganization.id,
        ...followUp,
        assignedToUserId: demoAdmin.id,
        createdByUserId: demoAdmin.id,
      },
    });
  }

  const pastoralNotes = [
    {
      id: "00000000-0000-4000-8000-000000000601",
      memberId: "00000000-0000-4000-8000-000000000203",
      category: PastoralCareCategory.GENERAL,
      title: "Encouragement check-in",
      note: "Discussed spiritual growth goals.",
      isConfidential: false,
      followUpDate: today,
      resolvedAt: null as Date | null,
    },
    {
      id: "00000000-0000-4000-8000-000000000602",
      memberId: "00000000-0000-4000-8000-000000000205",
      category: PastoralCareCategory.HOSPITAL_VISIT,
      title: "Hospital visit",
      note: "Visited after outpatient procedure.",
      isConfidential: false,
      followUpDate: null,
      resolvedAt: new Date(Date.UTC(2026, 5, 20)),
    },
    {
      id: "00000000-0000-4000-8000-000000000603",
      memberId: "00000000-0000-4000-8000-000000000207",
      category: PastoralCareCategory.FAMILY_SUPPORT,
      title: "Family support conversation",
      note: "Provided resources for family needs.",
      isConfidential: false,
      followUpDate: overdueDate,
      resolvedAt: null,
    },
    {
      id: "00000000-0000-4000-8000-000000000604",
      memberId: "00000000-0000-4000-8000-000000000204",
      category: PastoralCareCategory.COUNSELING,
      title: "Confidential counseling note",
      note: "Sensitive pastoral counseling details for authorized staff only.",
      isConfidential: true,
      followUpDate: today,
      resolvedAt: null,
    },
  ];

  for (const note of pastoralNotes) {
    await prisma.pastoralCareNote.upsert({
      where: { id: note.id },
      update: {
        organizationId: demoOrganization.id,
        ...note,
        assignedPastorUserId: demoAdmin.id,
        createdByUserId: demoAdmin.id,
      },
      create: {
        organizationId: demoOrganization.id,
        ...note,
        assignedPastorUserId: demoAdmin.id,
        createdByUserId: demoAdmin.id,
      },
    });
  }

  const prayerRequests = [
    {
      id: "00000000-0000-4000-8000-000000000701",
      memberId: "00000000-0000-4000-8000-000000000201",
      requesterName: "Alex Rivera",
      request: "Pray for job interview this week.",
      status: PrayerRequestStatus.ACTIVE,
      privacyLevel: PrayerPrivacyLevel.PUBLIC,
      answeredAt: null as Date | null,
      answerNotes: null as string | null,
    },
    {
      id: "00000000-0000-4000-8000-000000000702",
      memberId: "00000000-0000-4000-8000-000000000203",
      requesterName: "Morgan Smith",
      request: "Healing for a family member.",
      status: PrayerRequestStatus.IN_PRAYER,
      privacyLevel: PrayerPrivacyLevel.PRAYER_TEAM,
      answeredAt: null,
      answerNotes: null,
    },
    {
      id: "00000000-0000-4000-8000-000000000703",
      memberId: "00000000-0000-4000-8000-000000000205",
      requesterName: "Casey Nguyen",
      request: "Guidance for a career decision.",
      status: PrayerRequestStatus.ANSWERED,
      privacyLevel: PrayerPrivacyLevel.PRAYER_TEAM,
      answeredAt: new Date(Date.UTC(2026, 5, 15)),
      answerNotes: "Accepted a new role.",
    },
    {
      id: "00000000-0000-4000-8000-000000000704",
      memberId: "00000000-0000-4000-8000-000000000207",
      requesterName: "Sam Williams",
      request: "Travel mercies for upcoming trip.",
      status: PrayerRequestStatus.ANSWERED,
      privacyLevel: PrayerPrivacyLevel.PUBLIC,
      answeredAt: new Date(Date.UTC(2026, 5, 18)),
      answerNotes: "Safe travel reported.",
    },
    {
      id: "00000000-0000-4000-8000-000000000705",
      memberId: "00000000-0000-4000-8000-000000000204",
      requesterName: "Taylor Smith",
      request: "Pastoral staff prayer for a private concern.",
      status: PrayerRequestStatus.ACTIVE,
      privacyLevel: PrayerPrivacyLevel.PASTORAL_STAFF,
      answeredAt: null,
      answerNotes: null,
    },
    {
      id: "00000000-0000-4000-8000-000000000706",
      memberId: null as string | null,
      requesterName: "Anonymous Guest",
      request: "Pray for peace in our community.",
      status: PrayerRequestStatus.ACTIVE,
      privacyLevel: PrayerPrivacyLevel.PUBLIC,
      answeredAt: null,
      answerNotes: null,
    },
  ];

  for (const request of prayerRequests) {
    await prisma.prayerRequest.upsert({
      where: { id: request.id },
      update: {
        organizationId: demoOrganization.id,
        ...request,
        assignedToUserId: demoAdmin.id,
        createdByUserId: demoAdmin.id,
      },
      create: {
        organizationId: demoOrganization.id,
        ...request,
        assignedToUserId: demoAdmin.id,
        createdByUserId: demoAdmin.id,
      },
    });
  }

  const communications = [
    {
      id: "00000000-0000-4000-8000-000000000801",
      memberId: "00000000-0000-4000-8000-000000000201",
      communicationType: CommunicationType.PHONE,
      direction: CommunicationDirection.OUTBOUND,
      subject: "Welcome call",
      messageSummary: "Left a voicemail welcoming Alex to church.",
      communicationDate: new Date(Date.UTC(2026, 5, 2, 15, 0)),
      followUpRequired: true,
      followUpDate: overdueDate,
      outcome: "Voicemail left",
    },
    {
      id: "00000000-0000-4000-8000-000000000802",
      memberId: "00000000-0000-4000-8000-000000000202",
      communicationType: CommunicationType.EMAIL,
      direction: CommunicationDirection.OUTBOUND,
      subject: "Service invite",
      messageSummary: "Sent invite to next Sunday service.",
      communicationDate: new Date(Date.UTC(2026, 5, 3, 10, 0)),
      followUpRequired: false,
      followUpDate: null as Date | null,
      outcome: "Email sent",
    },
    {
      id: "00000000-0000-4000-8000-000000000803",
      memberId: "00000000-0000-4000-8000-000000000203",
      communicationType: CommunicationType.TEXT,
      direction: CommunicationDirection.INBOUND,
      subject: null as string | null,
      messageSummary: "Member texted about small group times.",
      communicationDate: new Date(Date.UTC(2026, 5, 4, 18, 30)),
      followUpRequired: false,
      followUpDate: null,
      outcome: "Answered",
    },
    {
      id: "00000000-0000-4000-8000-000000000804",
      memberId: "00000000-0000-4000-8000-000000000204",
      communicationType: CommunicationType.IN_PERSON,
      direction: CommunicationDirection.OUTBOUND,
      subject: "Lobby conversation",
      messageSummary: "Spoke after service about volunteering.",
      communicationDate: new Date(Date.UTC(2026, 5, 5, 12, 0)),
      followUpRequired: true,
      followUpDate: today,
      outcome: "Interested in kids ministry",
    },
    {
      id: "00000000-0000-4000-8000-000000000805",
      memberId: "00000000-0000-4000-8000-000000000205",
      communicationType: CommunicationType.PHONE,
      direction: CommunicationDirection.INBOUND,
      subject: "Prayer request call",
      messageSummary: "Received call requesting prayer for family.",
      communicationDate: new Date(Date.UTC(2026, 5, 6, 9, 15)),
      followUpRequired: false,
      followUpDate: null,
      outcome: "Logged prayer request",
    },
    {
      id: "00000000-0000-4000-8000-000000000806",
      memberId: "00000000-0000-4000-8000-000000000206",
      communicationType: CommunicationType.EMAIL,
      direction: CommunicationDirection.OUTBOUND,
      subject: "Event reminder",
      messageSummary: "Reminded about community picnic.",
      communicationDate: new Date(Date.UTC(2026, 5, 7, 14, 0)),
      followUpRequired: false,
      followUpDate: null,
      outcome: null,
    },
    {
      id: "00000000-0000-4000-8000-000000000807",
      memberId: "00000000-0000-4000-8000-000000000207",
      communicationType: CommunicationType.VIDEO_CALL,
      direction: CommunicationDirection.OUTBOUND,
      subject: "Pastoral check-in",
      messageSummary: "Video call to check on family support needs.",
      communicationDate: new Date(Date.UTC(2026, 5, 8, 16, 0)),
      followUpRequired: true,
      followUpDate: today,
      outcome: "Scheduled follow-up visit",
    },
    {
      id: "00000000-0000-4000-8000-000000000808",
      memberId: "00000000-0000-4000-8000-000000000208",
      communicationType: CommunicationType.LETTER,
      direction: CommunicationDirection.OUTBOUND,
      subject: "Thank you note",
      messageSummary: "Mailed thank-you note for volunteering.",
      communicationDate: new Date(Date.UTC(2026, 5, 9, 11, 0)),
      followUpRequired: false,
      followUpDate: null,
      outcome: "Mailed",
    },
  ];

  for (const communication of communications) {
    await prisma.memberCommunication.upsert({
      where: { id: communication.id },
      update: {
        organizationId: demoOrganization.id,
        ...communication,
        contactedByUserId: demoAdmin.id,
      },
      create: {
        organizationId: demoOrganization.id,
        ...communication,
        contactedByUserId: demoAdmin.id,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Member engagement: gifts, ministries, skills, milestones, documents
  // ---------------------------------------------------------------------------

  const spiritualGiftIds = DEFAULT_SPIRITUAL_GIFTS.map(
    (_, index) =>
      `00000000-0000-4000-8000-0000000009${String(index + 1).padStart(2, "0")}`,
  );

  for (const [index, gift] of DEFAULT_SPIRITUAL_GIFTS.entries()) {
    await prisma.spiritualGift.upsert({
      where: { id: spiritualGiftIds[index] },
      update: {
        organizationId: demoOrganization.id,
        name: gift.name,
        description: gift.description,
        category: gift.category,
        isActive: true,
      },
      create: {
        id: spiritualGiftIds[index],
        organizationId: demoOrganization.id,
        name: gift.name,
        description: gift.description,
        category: gift.category,
        isActive: true,
      },
    });
  }

  const ministries = [
    {
      id: "00000000-0000-4000-8000-000000000921",
      name: "Worship Team",
      description: "Sunday worship musicians and vocalists.",
      ministryType: MinistryType.WORSHIP,
      meetingSchedule: "Sundays 8:00 AM",
      location: "Sanctuary",
    },
    {
      id: "00000000-0000-4000-8000-000000000922",
      name: "Kids Church",
      description: "Children's ministry for elementary ages.",
      ministryType: MinistryType.CHILDREN,
      meetingSchedule: "Sundays during service",
      location: "Kids Wing",
    },
    {
      id: "00000000-0000-4000-8000-000000000923",
      name: "Youth Group",
      description: "Middle and high school discipleship.",
      ministryType: MinistryType.YOUTH,
      meetingSchedule: "Wednesdays 6:30 PM",
      location: "Youth Room",
    },
    {
      id: "00000000-0000-4000-8000-000000000924",
      name: "Hospitality Team",
      description: "Greeters, ushers, and coffee hosts.",
      ministryType: MinistryType.HOSPITALITY,
      meetingSchedule: "Sundays 9:00 AM",
      location: "Lobby",
    },
    {
      id: "00000000-0000-4000-8000-000000000925",
      name: "Prayer Ministry",
      description: "Intercession and prayer covering.",
      ministryType: MinistryType.PRAYER,
      meetingSchedule: "Tuesdays 7:00 PM",
      location: "Prayer Room",
    },
    {
      id: "00000000-0000-4000-8000-000000000926",
      name: "Outreach Team",
      description: "Community outreach and local missions.",
      ministryType: MinistryType.OUTREACH,
      meetingSchedule: "Monthly Saturdays",
      location: "Fellowship Hall",
    },
  ];

  for (const ministry of ministries) {
    await prisma.ministry.upsert({
      where: { id: ministry.id },
      update: {
        organizationId: demoOrganization.id,
        ...ministry,
        leaderUserId: demoAdmin.id,
        isActive: true,
      },
      create: {
        organizationId: demoOrganization.id,
        ...ministry,
        leaderUserId: demoAdmin.id,
        isActive: true,
      },
    });
  }

  const memberMinistryAssignments = [
    {
      id: "00000000-0000-4000-8000-000000000931",
      memberId: "00000000-0000-4000-8000-000000000201",
      ministryId: "00000000-0000-4000-8000-000000000921",
      role: MemberMinistryRole.VOLUNTEER,
      status: MemberMinistryStatus.ACTIVE,
      isLeader: false,
    },
    {
      id: "00000000-0000-4000-8000-000000000932",
      memberId: "00000000-0000-4000-8000-000000000202",
      ministryId: "00000000-0000-4000-8000-000000000921",
      role: MemberMinistryRole.TEAM_LEAD,
      status: MemberMinistryStatus.ACTIVE,
      isLeader: true,
    },
    {
      id: "00000000-0000-4000-8000-000000000933",
      memberId: "00000000-0000-4000-8000-000000000203",
      ministryId: "00000000-0000-4000-8000-000000000922",
      role: MemberMinistryRole.COORDINATOR,
      status: MemberMinistryStatus.ACTIVE,
      isLeader: true,
    },
    {
      id: "00000000-0000-4000-8000-000000000934",
      memberId: "00000000-0000-4000-8000-000000000204",
      ministryId: "00000000-0000-4000-8000-000000000922",
      role: MemberMinistryRole.VOLUNTEER,
      status: MemberMinistryStatus.ACTIVE,
      isLeader: false,
    },
    {
      id: "00000000-0000-4000-8000-000000000935",
      memberId: "00000000-0000-4000-8000-000000000205",
      ministryId: "00000000-0000-4000-8000-000000000923",
      role: MemberMinistryRole.TEAM_MEMBER,
      status: MemberMinistryStatus.ACTIVE,
      isLeader: false,
    },
    {
      id: "00000000-0000-4000-8000-000000000936",
      memberId: "00000000-0000-4000-8000-000000000206",
      ministryId: "00000000-0000-4000-8000-000000000923",
      role: MemberMinistryRole.VOLUNTEER,
      status: MemberMinistryStatus.ACTIVE,
      isLeader: false,
    },
    {
      id: "00000000-0000-4000-8000-000000000937",
      memberId: "00000000-0000-4000-8000-000000000207",
      ministryId: "00000000-0000-4000-8000-000000000924",
      role: MemberMinistryRole.VOLUNTEER,
      status: MemberMinistryStatus.ACTIVE,
      isLeader: false,
    },
    {
      id: "00000000-0000-4000-8000-000000000938",
      memberId: "00000000-0000-4000-8000-000000000208",
      ministryId: "00000000-0000-4000-8000-000000000924",
      role: MemberMinistryRole.TEAM_MEMBER,
      status: MemberMinistryStatus.ACTIVE,
      isLeader: false,
    },
    {
      id: "00000000-0000-4000-8000-000000000939",
      memberId: "00000000-0000-4000-8000-000000000201",
      ministryId: "00000000-0000-4000-8000-000000000925",
      role: MemberMinistryRole.PARTICIPANT,
      status: MemberMinistryStatus.ACTIVE,
      isLeader: false,
    },
    {
      id: "00000000-0000-4000-8000-000000000940",
      memberId: "00000000-0000-4000-8000-000000000203",
      ministryId: "00000000-0000-4000-8000-000000000925",
      role: MemberMinistryRole.VOLUNTEER,
      status: MemberMinistryStatus.PAUSED,
      isLeader: false,
    },
    {
      id: "00000000-0000-4000-8000-000000000941",
      memberId: "00000000-0000-4000-8000-000000000205",
      ministryId: "00000000-0000-4000-8000-000000000926",
      role: MemberMinistryRole.VOLUNTEER,
      status: MemberMinistryStatus.ACTIVE,
      isLeader: false,
    },
    {
      id: "00000000-0000-4000-8000-000000000942",
      memberId: "00000000-0000-4000-8000-000000000207",
      ministryId: "00000000-0000-4000-8000-000000000926",
      role: MemberMinistryRole.TEAM_LEAD,
      status: MemberMinistryStatus.ACTIVE,
      isLeader: true,
    },
  ];

  for (const assignment of memberMinistryAssignments) {
    await prisma.memberMinistry.upsert({
      where: { id: assignment.id },
      update: {
        ...assignment,
        joinedDate: new Date(Date.UTC(2025, 0, 15)),
      },
      create: {
        ...assignment,
        joinedDate: new Date(Date.UTC(2025, 0, 15)),
      },
    });
  }

  const giftAssignments = [
    {
      id: "00000000-0000-4000-8000-000000000951",
      memberId: "00000000-0000-4000-8000-000000000201",
      spiritualGiftId: spiritualGiftIds[12],
      proficiencyLevel: GiftProficiencyLevel.CONFIDENT,
      isPrimary: true,
    },
    {
      id: "00000000-0000-4000-8000-000000000952",
      memberId: "00000000-0000-4000-8000-000000000201",
      spiritualGiftId: spiritualGiftIds[0],
      proficiencyLevel: GiftProficiencyLevel.DEVELOPING,
      isPrimary: false,
    },
    {
      id: "00000000-0000-4000-8000-000000000953",
      memberId: "00000000-0000-4000-8000-000000000202",
      spiritualGiftId: spiritualGiftIds[7],
      proficiencyLevel: GiftProficiencyLevel.STRONG,
      isPrimary: true,
    },
    {
      id: "00000000-0000-4000-8000-000000000954",
      memberId: "00000000-0000-4000-8000-000000000203",
      spiritualGiftId: spiritualGiftIds[6],
      proficiencyLevel: GiftProficiencyLevel.CONFIDENT,
      isPrimary: true,
    },
    {
      id: "00000000-0000-4000-8000-000000000955",
      memberId: "00000000-0000-4000-8000-000000000204",
      spiritualGiftId: spiritualGiftIds[5],
      proficiencyLevel: GiftProficiencyLevel.DEVELOPING,
      isPrimary: false,
    },
    {
      id: "00000000-0000-4000-8000-000000000956",
      memberId: "00000000-0000-4000-8000-000000000205",
      spiritualGiftId: spiritualGiftIds[10],
      proficiencyLevel: GiftProficiencyLevel.MENTOR,
      isPrimary: true,
    },
    {
      id: "00000000-0000-4000-8000-000000000957",
      memberId: "00000000-0000-4000-8000-000000000206",
      spiritualGiftId: spiritualGiftIds[1],
      proficiencyLevel: GiftProficiencyLevel.DISCOVERING,
      isPrimary: false,
    },
    {
      id: "00000000-0000-4000-8000-000000000958",
      memberId: "00000000-0000-4000-8000-000000000207",
      spiritualGiftId: spiritualGiftIds[8],
      proficiencyLevel: GiftProficiencyLevel.STRONG,
      isPrimary: true,
    },
    {
      id: "00000000-0000-4000-8000-000000000959",
      memberId: "00000000-0000-4000-8000-000000000208",
      spiritualGiftId: spiritualGiftIds[11],
      proficiencyLevel: GiftProficiencyLevel.CONFIDENT,
      isPrimary: false,
    },
  ];

  for (const assignment of giftAssignments) {
    await prisma.memberSpiritualGift.upsert({
      where: { id: assignment.id },
      update: {
        ...assignment,
        identifiedDate: new Date(Date.UTC(2024, 5, 1)),
      },
      create: {
        ...assignment,
        identifiedDate: new Date(Date.UTC(2024, 5, 1)),
      },
    });
  }

  const skills = [
    {
      id: "00000000-0000-4000-8000-000000000961",
      memberId: "00000000-0000-4000-8000-000000000201",
      skillName: "Sound Board",
      skillCategory: "Media",
      proficiencyLevel: SkillProficiencyLevel.ADVANCED,
      yearsExperience: 5,
      isAvailableToServe: true,
    },
    {
      id: "00000000-0000-4000-8000-000000000962",
      memberId: "00000000-0000-4000-8000-000000000202",
      skillName: "Guitar",
      skillCategory: "Music",
      proficiencyLevel: SkillProficiencyLevel.EXPERT,
      yearsExperience: 12,
      isAvailableToServe: true,
    },
    {
      id: "00000000-0000-4000-8000-000000000963",
      memberId: "00000000-0000-4000-8000-000000000203",
      skillName: "Teaching",
      skillCategory: "Education",
      proficiencyLevel: SkillProficiencyLevel.ADVANCED,
      yearsExperience: 8,
      isAvailableToServe: true,
    },
    {
      id: "00000000-0000-4000-8000-000000000964",
      memberId: "00000000-0000-4000-8000-000000000204",
      skillName: "Childcare",
      skillCategory: "Children",
      proficiencyLevel: SkillProficiencyLevel.INTERMEDIATE,
      yearsExperience: 3,
      isAvailableToServe: true,
    },
    {
      id: "00000000-0000-4000-8000-000000000965",
      memberId: "00000000-0000-4000-8000-000000000205",
      skillName: "Graphic Design",
      skillCategory: "Media",
      proficiencyLevel: SkillProficiencyLevel.ADVANCED,
      yearsExperience: 6,
      isAvailableToServe: false,
    },
    {
      id: "00000000-0000-4000-8000-000000000966",
      memberId: "00000000-0000-4000-8000-000000000206",
      skillName: "Cooking",
      skillCategory: "Hospitality",
      proficiencyLevel: SkillProficiencyLevel.INTERMEDIATE,
      yearsExperience: 4,
      isAvailableToServe: true,
    },
    {
      id: "00000000-0000-4000-8000-000000000967",
      memberId: "00000000-0000-4000-8000-000000000207",
      skillName: "Counseling",
      skillCategory: "Care",
      proficiencyLevel: SkillProficiencyLevel.EXPERT,
      yearsExperience: 10,
      isAvailableToServe: true,
    },
    {
      id: "00000000-0000-4000-8000-000000000968",
      memberId: "00000000-0000-4000-8000-000000000208",
      skillName: "Photography",
      skillCategory: "Media",
      proficiencyLevel: SkillProficiencyLevel.BEGINNER,
      yearsExperience: 1,
      isAvailableToServe: true,
    },
    {
      id: "00000000-0000-4000-8000-000000000969",
      memberId: "00000000-0000-4000-8000-000000000201",
      skillName: "Video Editing",
      skillCategory: "Media",
      proficiencyLevel: SkillProficiencyLevel.INTERMEDIATE,
      yearsExperience: 2,
      isAvailableToServe: false,
    },
    {
      id: "00000000-0000-4000-8000-000000000970",
      memberId: "00000000-0000-4000-8000-000000000203",
      skillName: "Event Planning",
      skillCategory: "Administration",
      proficiencyLevel: SkillProficiencyLevel.ADVANCED,
      yearsExperience: 7,
      isAvailableToServe: true,
    },
  ];

  for (const skill of skills) {
    await prisma.memberSkill.upsert({
      where: { id: skill.id },
      update: skill,
      create: skill,
    });
  }

  const interests = [
    {
      id: "00000000-0000-4000-8000-000000000971",
      memberId: "00000000-0000-4000-8000-000000000201",
      interestName: "Missions Trips",
      interestCategory: "Missions",
    },
    {
      id: "00000000-0000-4000-8000-000000000972",
      memberId: "00000000-0000-4000-8000-000000000202",
      interestName: "Worship Leading",
      interestCategory: "Worship",
    },
    {
      id: "00000000-0000-4000-8000-000000000973",
      memberId: "00000000-0000-4000-8000-000000000203",
      interestName: "Small Groups",
      interestCategory: "Discipleship",
    },
    {
      id: "00000000-0000-4000-8000-000000000974",
      memberId: "00000000-0000-4000-8000-000000000204",
      interestName: "Kids Ministry",
      interestCategory: "Children",
    },
    {
      id: "00000000-0000-4000-8000-000000000975",
      memberId: "00000000-0000-4000-8000-000000000205",
      interestName: "Social Media",
      interestCategory: "Media",
    },
    {
      id: "00000000-0000-4000-8000-000000000976",
      memberId: "00000000-0000-4000-8000-000000000206",
      interestName: "Community Meals",
      interestCategory: "Hospitality",
    },
    {
      id: "00000000-0000-4000-8000-000000000977",
      memberId: "00000000-0000-4000-8000-000000000207",
      interestName: "Pastoral Care",
      interestCategory: "Care",
    },
    {
      id: "00000000-0000-4000-8000-000000000978",
      memberId: "00000000-0000-4000-8000-000000000208",
      interestName: "Youth Mentoring",
      interestCategory: "Youth",
    },
  ];

  for (const interest of interests) {
    await prisma.memberInterest.upsert({
      where: { id: interest.id },
      update: interest,
      create: interest,
    });
  }

  const milestones = [
    {
      id: "00000000-0000-4000-8000-000000000981",
      memberId: "00000000-0000-4000-8000-000000000201",
      milestoneType: MembershipMilestoneType.SALVATION,
      title: "Profession of faith",
      milestoneDate: new Date(Date.UTC(2018, 3, 12)),
    },
    {
      id: "00000000-0000-4000-8000-000000000982",
      memberId: "00000000-0000-4000-8000-000000000201",
      milestoneType: MembershipMilestoneType.BAPTISM,
      title: "Baptism Sunday",
      milestoneDate: new Date(Date.UTC(2018, 5, 3)),
    },
    {
      id: "00000000-0000-4000-8000-000000000983",
      memberId: "00000000-0000-4000-8000-000000000203",
      milestoneType: MembershipMilestoneType.BAPTISM,
      title: "Believer's baptism",
      milestoneDate: new Date(Date.UTC(2020, 7, 15)),
    },
    {
      id: "00000000-0000-4000-8000-000000000984",
      memberId: "00000000-0000-4000-8000-000000000203",
      milestoneType: MembershipMilestoneType.MEMBERSHIP,
      title: "Joined membership",
      milestoneDate: new Date(Date.UTC(2021, 0, 10)),
    },
    {
      id: "00000000-0000-4000-8000-000000000985",
      memberId: "00000000-0000-4000-8000-000000000205",
      milestoneType: MembershipMilestoneType.MEMBERSHIP,
      title: "Membership class complete",
      milestoneDate: new Date(Date.UTC(2022, 8, 4)),
    },
    {
      id: "00000000-0000-4000-8000-000000000986",
      memberId: "00000000-0000-4000-8000-000000000202",
      milestoneType: MembershipMilestoneType.FIRST_VISIT,
      title: "First Sunday visit",
      milestoneDate: new Date(Date.UTC(2019, 2, 17)),
    },
    {
      id: "00000000-0000-4000-8000-000000000987",
      memberId: "00000000-0000-4000-8000-000000000204",
      milestoneType: MembershipMilestoneType.CHILD_DEDICATION,
      title: "Child dedication",
      milestoneDate: new Date(Date.UTC(2023, 4, 21)),
    },
    {
      id: "00000000-0000-4000-8000-000000000988",
      memberId: "00000000-0000-4000-8000-000000000206",
      milestoneType: MembershipMilestoneType.TRANSFER_IN,
      title: "Transfer from sister church",
      milestoneDate: new Date(Date.UTC(2024, 1, 11)),
    },
    {
      id: "00000000-0000-4000-8000-000000000989",
      memberId: "00000000-0000-4000-8000-000000000207",
      milestoneType: MembershipMilestoneType.MARRIAGE,
      title: "Wedding ceremony",
      milestoneDate: new Date(Date.UTC(2015, 9, 3)),
    },
    {
      id: "00000000-0000-4000-8000-000000000990",
      memberId: "00000000-0000-4000-8000-000000000208",
      milestoneType: MembershipMilestoneType.OTHER,
      title: "Volunteer orientation complete",
      milestoneDate: new Date(Date.UTC(2025, 10, 2)),
    },
  ];

  for (const milestone of milestones) {
    await prisma.memberMilestone.upsert({
      where: { id: milestone.id },
      update: {
        organizationId: demoOrganization.id,
        ...milestone,
        createdByUserId: demoAdmin.id,
      },
      create: {
        organizationId: demoOrganization.id,
        ...milestone,
        createdByUserId: demoAdmin.id,
      },
    });
  }

  const expiringSoon = new Date();
  expiringSoon.setUTCDate(expiringSoon.getUTCDate() + 14);

  const documents = [
    {
      id: "00000000-0000-4000-8000-000000000991",
      memberId: "00000000-0000-4000-8000-000000000201",
      documentType: MemberDocumentType.BAPTISM_CERTIFICATE,
      title: "Baptism certificate",
      description: "Scanned baptism certificate",
      fileName: "baptism-certificate.pdf",
      fileUrl: "/uploads/members/demo/201/documents/baptism-certificate.pdf",
      fileKey: "/uploads/members/demo/201/documents/baptism-certificate.pdf",
      mimeType: "application/pdf",
      fileSize: 102400,
      isConfidential: false,
      expirationDate: null as Date | null,
    },
    {
      id: "00000000-0000-4000-8000-000000000992",
      memberId: "00000000-0000-4000-8000-000000000203",
      documentType: MemberDocumentType.MEMBERSHIP_FORM,
      title: "Membership application",
      description: null,
      fileName: "membership-form.pdf",
      fileUrl: "/uploads/members/demo/203/documents/membership-form.pdf",
      fileKey: "/uploads/members/demo/203/documents/membership-form.pdf",
      mimeType: "application/pdf",
      fileSize: 81920,
      isConfidential: false,
      expirationDate: null,
    },
    {
      id: "00000000-0000-4000-8000-000000000993",
      memberId: "00000000-0000-4000-8000-000000000204",
      documentType: MemberDocumentType.BACKGROUND_CHECK,
      title: "Background check",
      description: "Volunteer background screening",
      fileName: "background-check.pdf",
      fileUrl: "/uploads/members/demo/204/documents/background-check.pdf",
      fileKey: "/uploads/members/demo/204/documents/background-check.pdf",
      mimeType: "application/pdf",
      fileSize: 65536,
      isConfidential: true,
      expirationDate: expiringSoon,
    },
    {
      id: "00000000-0000-4000-8000-000000000994",
      memberId: "00000000-0000-4000-8000-000000000205",
      documentType: MemberDocumentType.TRAINING_CERTIFICATE,
      title: "Child safety training",
      description: null,
      fileName: "child-safety.pdf",
      fileUrl: "/uploads/members/demo/205/documents/child-safety.pdf",
      fileKey: "/uploads/members/demo/205/documents/child-safety.pdf",
      mimeType: "application/pdf",
      fileSize: 45056,
      isConfidential: false,
      expirationDate: new Date(Date.UTC(2027, 0, 1)),
    },
    {
      id: "00000000-0000-4000-8000-000000000995",
      memberId: "00000000-0000-4000-8000-000000000207",
      documentType: MemberDocumentType.VOLUNTEER_APPLICATION,
      title: "Volunteer application",
      description: "Outreach volunteer packet",
      fileName: "volunteer-application.pdf",
      fileUrl: "/uploads/members/demo/207/documents/volunteer-application.pdf",
      fileKey: "/uploads/members/demo/207/documents/volunteer-application.pdf",
      mimeType: "application/pdf",
      fileSize: 73728,
      isConfidential: false,
      expirationDate: null,
    },
  ];

  for (const document of documents) {
    await prisma.memberDocument.upsert({
      where: { id: document.id },
      update: {
        organizationId: demoOrganization.id,
        ...document,
        uploadedByUserId: demoAdmin.id,
      },
      create: {
        organizationId: demoOrganization.id,
        ...document,
        uploadedByUserId: demoAdmin.id,
      },
    });
  }

  console.log(
    "Seeded demo members, households, emergency contacts, care engagement, and member engagement data",
  );

  // ---------------------------------------------------------------------------
  // Blueprint 6.6 – lifecycle, duplicates, consent
  // ---------------------------------------------------------------------------

  await prisma.member.update({
    where: { id: "00000000-0000-4000-8000-000000000209" },
    data: {
      firstName: "Alex",
      lastName: "Rivera",
      preferredName: "Alex R.",
      email: "alex.rivera@example.org",
      phone: "(615) 555-1099",
      recordStatus: MemberRecordStatus.ACTIVE,
    },
  });

  await prisma.member.update({
    where: { id: "00000000-0000-4000-8000-000000000208" },
    data: {
      recordStatus: MemberRecordStatus.ARCHIVED,
      archivedAt: new Date("2025-11-01T00:00:00.000Z"),
      archivedByUserId: demoAdmin.id,
      archiveReason: "Moved Away",
    },
  });

  await prisma.member.update({
    where: { id: "00000000-0000-4000-8000-000000000205" },
    data: {
      recordStatus: MemberRecordStatus.INACTIVE,
      membershipStatus: MembershipStatus.INACTIVE,
    },
  });

  await prisma.member.update({
    where: { id: "00000000-0000-4000-8000-000000000202" },
    data: {
      recordStatus: MemberRecordStatus.DECEASED,
      membershipStatus: MembershipStatus.DECEASED,
      deceasedDate: new Date("2024-06-15T00:00:00.000Z"),
      deceasedNotes: "Demo deceased member for lifecycle testing",
      allowEmail: false,
      allowSms: false,
      allowPhoneCalls: false,
      allowPostalMail: false,
      allowDirectoryListing: false,
      allowPhotoUse: false,
      preferredContactMethod: PreferredContactMethod.DO_NOT_CONTACT,
      emailOptOutDate: new Date("2024-06-15T00:00:00.000Z"),
      smsOptOutDate: new Date("2024-06-15T00:00:00.000Z"),
      directoryOptOutDate: new Date("2024-06-15T00:00:00.000Z"),
      photoOptOutDate: new Date("2024-06-15T00:00:00.000Z"),
    },
  });

  await prisma.member.update({
    where: { id: "00000000-0000-4000-8000-000000000201" },
    data: {
      preferredContactMethod: PreferredContactMethod.EMAIL,
      allowEmail: true,
      allowSms: true,
      allowPhoneCalls: true,
      allowPostalMail: true,
      allowDirectoryListing: true,
      allowPhotoUse: true,
      consentUpdatedAt: new Date(),
      consentUpdatedByUserId: demoAdmin.id,
    },
  });

  await prisma.member.update({
    where: { id: "00000000-0000-4000-8000-000000000203" },
    data: {
      preferredContactMethod: PreferredContactMethod.DO_NOT_CONTACT,
      allowEmail: false,
      allowSms: false,
      allowPhoneCalls: false,
      allowPostalMail: false,
      allowDirectoryListing: false,
      allowPhotoUse: false,
      emailOptOutDate: new Date("2025-01-10T00:00:00.000Z"),
      smsOptOutDate: new Date("2025-01-10T00:00:00.000Z"),
      directoryOptOutDate: new Date("2025-01-10T00:00:00.000Z"),
      photoOptOutDate: new Date("2025-01-10T00:00:00.000Z"),
      consentUpdatedAt: new Date(),
      consentUpdatedByUserId: demoAdmin.id,
    },
  });

  await prisma.member.update({
    where: { id: "00000000-0000-4000-8000-000000000204" },
    data: {
      preferredContactMethod: PreferredContactMethod.SMS,
      allowEmail: true,
      allowSms: true,
      allowPhoneCalls: false,
      allowPostalMail: true,
      allowDirectoryListing: false,
      allowPhotoUse: true,
      directoryOptOutDate: new Date("2025-03-01T00:00:00.000Z"),
      consentUpdatedAt: new Date(),
      consentUpdatedByUserId: demoAdmin.id,
    },
  });

  await prisma.member.update({
    where: { id: "00000000-0000-4000-8000-000000000206" },
    data: {
      preferredContactMethod: PreferredContactMethod.PHONE,
      allowEmail: false,
      allowSms: false,
      allowPhoneCalls: true,
      allowPostalMail: true,
      allowDirectoryListing: true,
      allowPhotoUse: false,
      emailOptOutDate: new Date("2025-02-01T00:00:00.000Z"),
      smsOptOutDate: new Date("2025-02-01T00:00:00.000Z"),
      photoOptOutDate: new Date("2025-02-01T00:00:00.000Z"),
      consentUpdatedAt: new Date(),
      consentUpdatedByUserId: demoAdmin.id,
    },
  });

  const consentRecords = [
    {
      id: "00000000-0000-4000-8000-000000000a01",
      memberId: "00000000-0000-4000-8000-000000000201",
      consentType: MemberConsentType.EMAIL,
      previousValue: "true",
      newValue: "true",
      source: ConsentChangeSource.STAFF_UPDATE,
      notes: "Confirmed email preference",
    },
    {
      id: "00000000-0000-4000-8000-000000000a02",
      memberId: "00000000-0000-4000-8000-000000000203",
      consentType: MemberConsentType.GENERAL_COMMUNICATION,
      previousValue: "EMAIL",
      newValue: "DO_NOT_CONTACT",
      source: ConsentChangeSource.MEMBER_REQUEST,
      notes: "Member requested no contact",
    },
    {
      id: "00000000-0000-4000-8000-000000000a03",
      memberId: "00000000-0000-4000-8000-000000000203",
      consentType: MemberConsentType.EMAIL,
      previousValue: "true",
      newValue: "false",
      source: ConsentChangeSource.MEMBER_REQUEST,
      notes: null,
    },
    {
      id: "00000000-0000-4000-8000-000000000a04",
      memberId: "00000000-0000-4000-8000-000000000204",
      consentType: MemberConsentType.DIRECTORY_LISTING,
      previousValue: "true",
      newValue: "false",
      source: ConsentChangeSource.STAFF_UPDATE,
      notes: "Directory opt-out",
    },
    {
      id: "00000000-0000-4000-8000-000000000a05",
      memberId: "00000000-0000-4000-8000-000000000206",
      consentType: MemberConsentType.SMS,
      previousValue: "true",
      newValue: "false",
      source: ConsentChangeSource.ONLINE_FORM,
      notes: null,
    },
    {
      id: "00000000-0000-4000-8000-000000000a06",
      memberId: "00000000-0000-4000-8000-000000000206",
      consentType: MemberConsentType.PHOTO_USE,
      previousValue: "true",
      newValue: "false",
      source: ConsentChangeSource.STAFF_UPDATE,
      notes: "Photo opt-out",
    },
    {
      id: "00000000-0000-4000-8000-000000000a07",
      memberId: "00000000-0000-4000-8000-000000000202",
      consentType: MemberConsentType.EMAIL,
      previousValue: "true",
      newValue: "false",
      source: ConsentChangeSource.ADMINISTRATIVE,
      notes: "Deceased — communications disabled",
    },
  ];

  for (const entry of consentRecords) {
    await prisma.memberConsentHistory.upsert({
      where: { id: entry.id },
      update: {
        ...entry,
        changedByUserId: demoAdmin.id,
      },
      create: {
        ...entry,
        changedByUserId: demoAdmin.id,
      },
    });
  }

  const duplicateCandidates = [
    {
      id: "00000000-0000-4000-8000-000000000b01",
      memberAId: "00000000-0000-4000-8000-000000000201",
      memberBId: "00000000-0000-4000-8000-000000000209",
      matchScore: 90,
      matchReasons: ["Exact email match", "Exact first and last name match"],
      status: DuplicateCandidateStatus.PENDING,
    },
    {
      id: "00000000-0000-4000-8000-000000000b02",
      memberAId: "00000000-0000-4000-8000-000000000203",
      memberBId: "00000000-0000-4000-8000-000000000204",
      matchScore: 50,
      matchReasons: ["Exact first and last name match", "Shared household"],
      status: DuplicateCandidateStatus.PENDING,
    },
    {
      id: "00000000-0000-4000-8000-000000000b03",
      memberAId: "00000000-0000-4000-8000-000000000206",
      memberBId: "00000000-0000-4000-8000-000000000207",
      matchScore: 35,
      matchReasons: ["Similar spelling of name"],
      status: DuplicateCandidateStatus.DISMISSED,
      reviewedByUserId: demoAdmin.id,
      reviewedAt: new Date("2025-12-01T00:00:00.000Z"),
    },
  ];

  for (const candidate of duplicateCandidates) {
    await prisma.memberDuplicateCandidate.upsert({
      where: { id: candidate.id },
      update: {
        organizationId: demoOrganization.id,
        ...candidate,
      },
      create: {
        organizationId: demoOrganization.id,
        ...candidate,
      },
    });
  }

  console.log("Seeded member lifecycle, consent history, and duplicate candidates");

  // ---------------------------------------------------------------------------
  // Blueprint 7.1 – Events foundation
  // ---------------------------------------------------------------------------

  const eventCategoryIds = DEFAULT_EVENT_CATEGORIES.map(
    (_, index) =>
      `00000000-0000-4000-8000-${String(0x1100 + index).padStart(12, "0")}`,
  );

  for (let index = 0; index < DEFAULT_EVENT_CATEGORIES.length; index += 1) {
    const category = DEFAULT_EVENT_CATEGORIES[index];
    await prisma.eventCategory.upsert({
      where: { id: eventCategoryIds[index] },
      update: {
        organizationId: demoOrganization.id,
        name: category.name,
        color: category.color,
        icon: category.icon,
        isActive: true,
      },
      create: {
        id: eventCategoryIds[index],
        organizationId: demoOrganization.id,
        name: category.name,
        color: category.color,
        icon: category.icon,
        isActive: true,
      },
    });
  }

  const eventLocationIds = DEFAULT_EVENT_LOCATIONS.map(
    (_, index) =>
      `00000000-0000-4000-8000-${String(0x1200 + index).padStart(12, "0")}`,
  );

  for (let index = 0; index < DEFAULT_EVENT_LOCATIONS.length; index += 1) {
    const location = DEFAULT_EVENT_LOCATIONS[index];
    await prisma.eventLocation.upsert({
      where: { id: eventLocationIds[index] },
      update: {
        organizationId: demoOrganization.id,
        name: location.name,
        roomName: "roomName" in location ? location.roomName ?? null : null,
        capacity: location.capacity ?? null,
        isOnline: location.isOnline,
        isActive: true,
      },
      create: {
        id: eventLocationIds[index],
        organizationId: demoOrganization.id,
        name: location.name,
        roomName: "roomName" in location ? location.roomName ?? null : null,
        capacity: location.capacity ?? null,
        isOnline: location.isOnline,
        onlineMeetingUrl: location.isOnline
          ? "https://example.com/meet/demo-online"
          : null,
        isActive: true,
      },
    });
  }

  const daysFromNow = (days: number, hour = 10) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + days);
    date.setUTCHours(hour, 0, 0, 0);
    return date;
  };

  const eventSeeds: Array<{
    id: string;
    title: string;
    slug: string;
    shortDescription: string;
    categoryIndex: number;
    locationIndex: number;
    eventStatus: EventStatus;
    visibility: EventVisibility;
    start: Date;
    end: Date;
    registrationRequired?: boolean;
    registrationCapacity?: number;
    isRecurring?: boolean;
    recurrenceRule?: string;
    ministryIds?: string[];
    organizers?: Array<{
      id: string;
      role: EventOrganizerRole;
      isPrimary: boolean;
      organizerName?: string;
      userId?: string;
      memberId?: string;
    }>;
  }> = [
    {
      id: "00000000-0000-4000-8000-000000001001",
      title: "Sunday Morning Worship",
      slug: "sunday-morning-worship",
      shortDescription: "Weekly corporate worship service.",
      categoryIndex: 0,
      locationIndex: 0,
      eventStatus: EventStatus.PUBLISHED,
      visibility: EventVisibility.PUBLIC,
      start: daysFromNow(2, 10),
      end: daysFromNow(2, 11),
      isRecurring: true,
      recurrenceRule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=SU",
      ministryIds: ["00000000-0000-4000-8000-000000000921"],
      organizers: [
        {
          id: "00000000-0000-4000-8000-000000001101",
          role: EventOrganizerRole.PASTOR,
          isPrimary: true,
          userId: demoAdmin.id,
        },
        {
          id: "00000000-0000-4000-8000-000000001102",
          role: EventOrganizerRole.HOST,
          isPrimary: false,
          organizerName: "Worship Host",
        },
      ],
    },
    {
      id: "00000000-0000-4000-8000-000000001002",
      title: "Midweek Bible Study",
      slug: "midweek-bible-study",
      shortDescription: "Verse-by-verse study for adults.",
      categoryIndex: 1,
      locationIndex: 1,
      eventStatus: EventStatus.PUBLISHED,
      visibility: EventVisibility.MEMBERS_ONLY,
      start: daysFromNow(4, 18),
      end: daysFromNow(4, 19),
      isRecurring: true,
      recurrenceRule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=WE",
      ministryIds: ["00000000-0000-4000-8000-000000000925"],
      organizers: [
        {
          id: "00000000-0000-4000-8000-000000001103",
          role: EventOrganizerRole.COORDINATOR,
          isPrimary: true,
          organizerName: "Study Leader",
        },
        {
          id: "00000000-0000-4000-8000-000000001104",
          role: EventOrganizerRole.OTHER,
          isPrimary: false,
          memberId: "00000000-0000-4000-8000-000000000201",
        },
      ],
    },
    {
      id: "00000000-0000-4000-8000-000000001003",
      title: "Youth Night",
      slug: "youth-night",
      shortDescription: "Games, teaching, and small groups.",
      categoryIndex: 3,
      locationIndex: 2,
      eventStatus: EventStatus.PUBLISHED,
      visibility: EventVisibility.PUBLIC,
      start: daysFromNow(5, 18),
      end: daysFromNow(5, 20),
      registrationRequired: true,
      registrationCapacity: 60,
      ministryIds: ["00000000-0000-4000-8000-000000000923"],
      organizers: [
        {
          id: "00000000-0000-4000-8000-000000001105",
          role: EventOrganizerRole.MINISTRY_LEADER,
          isPrimary: true,
          userId: demoAdmin.id,
        },
      ],
    },
    {
      id: "00000000-0000-4000-8000-000000001004",
      title: "Community Outreach Day",
      slug: "community-outreach-day",
      shortDescription: "Serve neighbors with practical help.",
      categoryIndex: 5,
      locationIndex: 1,
      eventStatus: EventStatus.PUBLISHED,
      visibility: EventVisibility.PUBLIC,
      start: daysFromNow(10, 9),
      end: daysFromNow(10, 13),
      registrationRequired: true,
      registrationCapacity: 40,
      organizers: [
        {
          id: "00000000-0000-4000-8000-000000001106",
          role: EventOrganizerRole.COORDINATOR,
          isPrimary: true,
          organizerName: "Outreach Lead",
        },
      ],
    },
    {
      id: "00000000-0000-4000-8000-000000001005",
      title: "Newcomers Lunch",
      slug: "newcomers-lunch",
      shortDescription: "Meet pastors and connect with the church family.",
      categoryIndex: 6,
      locationIndex: 1,
      eventStatus: EventStatus.PUBLISHED,
      visibility: EventVisibility.PUBLIC,
      start: daysFromNow(14, 12),
      end: daysFromNow(14, 13),
      registrationRequired: true,
      registrationCapacity: 30,
      organizers: [
        {
          id: "00000000-0000-4000-8000-000000001107",
          role: EventOrganizerRole.HOST,
          isPrimary: true,
          organizerName: "Hospitality Team",
        },
      ],
    },
    {
      id: "00000000-0000-4000-8000-000000001006",
      title: "Online Prayer Gathering",
      slug: "online-prayer-gathering",
      shortDescription: "Join from home for corporate prayer.",
      categoryIndex: 2,
      locationIndex: 4,
      eventStatus: EventStatus.PUBLISHED,
      visibility: EventVisibility.MEMBERS_ONLY,
      start: daysFromNow(3, 19),
      end: daysFromNow(3, 20),
      organizers: [
        {
          id: "00000000-0000-4000-8000-000000001108",
          role: EventOrganizerRole.PASTOR,
          isPrimary: true,
          userId: demoAdmin.id,
        },
      ],
    },
    {
      id: "00000000-0000-4000-8000-000000001007",
      title: "Leadership Training Webinar",
      slug: "leadership-training-webinar",
      shortDescription: "Virtual equipping for ministry leaders.",
      categoryIndex: 8,
      locationIndex: 4,
      eventStatus: EventStatus.PUBLISHED,
      visibility: EventVisibility.STAFF_ONLY,
      start: daysFromNow(21, 18),
      end: daysFromNow(21, 20),
      organizers: [
        {
          id: "00000000-0000-4000-8000-000000001109",
          role: EventOrganizerRole.COORDINATOR,
          isPrimary: true,
          organizerName: "Training Desk",
        },
      ],
    },
    {
      id: "00000000-0000-4000-8000-000000001008",
      title: "Kids Camp Planning Draft",
      slug: "kids-camp-planning-draft",
      shortDescription: "Internal planning session (draft).",
      categoryIndex: 4,
      locationIndex: 3,
      eventStatus: EventStatus.DRAFT,
      visibility: EventVisibility.STAFF_ONLY,
      start: daysFromNow(30, 14),
      end: daysFromNow(30, 16),
    },
    {
      id: "00000000-0000-4000-8000-000000001009",
      title: "Private Elder Retreat Draft",
      slug: "private-elder-retreat-draft",
      shortDescription: "Confidential planning draft.",
      categoryIndex: 8,
      locationIndex: 3,
      eventStatus: EventStatus.DRAFT,
      visibility: EventVisibility.PRIVATE,
      start: daysFromNow(45, 9),
      end: daysFromNow(45, 17),
    },
    {
      id: "00000000-0000-4000-8000-00000000100a",
      title: "Cancelled Picnic",
      slug: "cancelled-picnic",
      shortDescription: "Weather cancellation example.",
      categoryIndex: 6,
      locationIndex: 1,
      eventStatus: EventStatus.CANCELLED,
      visibility: EventVisibility.PUBLIC,
      start: daysFromNow(7, 11),
      end: daysFromNow(7, 14),
    },
    {
      id: "00000000-0000-4000-8000-00000000100b",
      title: "Spring Conference",
      slug: "spring-conference",
      shortDescription: "Completed conference from earlier this year.",
      categoryIndex: 9,
      locationIndex: 0,
      eventStatus: EventStatus.COMPLETED,
      visibility: EventVisibility.PUBLIC,
      start: daysFromNow(-40, 9),
      end: daysFromNow(-40, 16),
    },
    {
      id: "00000000-0000-4000-8000-00000000100c",
      title: "Volunteer Orientation",
      slug: "volunteer-orientation",
      shortDescription: "Onboarding for new volunteers.",
      categoryIndex: 7,
      locationIndex: 1,
      eventStatus: EventStatus.PUBLISHED,
      visibility: EventVisibility.STAFF_ONLY,
      start: daysFromNow(12, 17),
      end: daysFromNow(12, 19),
      organizers: [
        {
          id: "00000000-0000-4000-8000-00000000110a",
          role: EventOrganizerRole.VOLUNTEER_LEAD,
          isPrimary: true,
          organizerName: "Volunteer Desk",
        },
      ],
    },
  ];

  for (const seed of eventSeeds) {
    await prisma.event.upsert({
      where: { id: seed.id },
      update: {
        organizationId: demoOrganization.id,
        title: seed.title,
        slug: seed.slug,
        shortDescription: seed.shortDescription,
        categoryId: eventCategoryIds[seed.categoryIndex],
        locationId: eventLocationIds[seed.locationIndex],
        eventStatus: seed.eventStatus,
        visibility: seed.visibility,
        startDateTime: seed.start,
        endDateTime: seed.end,
        timezone: "America/Chicago",
        registrationRequired: Boolean(seed.registrationRequired),
        registrationCapacity: seed.registrationCapacity ?? null,
        isRecurring: Boolean(seed.isRecurring),
        recurrenceRule: seed.recurrenceRule ?? null,
        createdByUserId: demoAdmin.id,
        publishedAt:
          seed.eventStatus === EventStatus.PUBLISHED ? seed.start : null,
        cancelledAt:
          seed.eventStatus === EventStatus.CANCELLED ? new Date() : null,
      },
      create: {
        id: seed.id,
        organizationId: demoOrganization.id,
        title: seed.title,
        slug: seed.slug,
        shortDescription: seed.shortDescription,
        description: `${seed.shortDescription} (demo seed data)`,
        categoryId: eventCategoryIds[seed.categoryIndex],
        locationId: eventLocationIds[seed.locationIndex],
        eventStatus: seed.eventStatus,
        visibility: seed.visibility,
        startDateTime: seed.start,
        endDateTime: seed.end,
        timezone: "America/Chicago",
        registrationRequired: Boolean(seed.registrationRequired),
        registrationCapacity: seed.registrationCapacity ?? null,
        waitlistEnabled: Boolean(seed.registrationRequired),
        isRecurring: Boolean(seed.isRecurring),
        recurrenceRule: seed.recurrenceRule ?? null,
        createdByUserId: demoAdmin.id,
        publishedAt:
          seed.eventStatus === EventStatus.PUBLISHED ? seed.start : null,
        cancelledAt:
          seed.eventStatus === EventStatus.CANCELLED ? new Date() : null,
      },
    });

    if (seed.organizers) {
      for (const organizer of seed.organizers) {
        await prisma.eventOrganizer.upsert({
          where: { id: organizer.id },
          update: {
            eventId: seed.id,
            userId: organizer.userId ?? null,
            memberId: organizer.memberId ?? null,
            organizerName: organizer.organizerName ?? null,
            role: organizer.role,
            isPrimary: organizer.isPrimary,
          },
          create: {
            id: organizer.id,
            eventId: seed.id,
            userId: organizer.userId ?? null,
            memberId: organizer.memberId ?? null,
            organizerName: organizer.organizerName ?? null,
            role: organizer.role,
            isPrimary: organizer.isPrimary,
          },
        });
      }
    }

    if (seed.ministryIds) {
      for (let i = 0; i < seed.ministryIds.length; i += 1) {
        const ministryId = seed.ministryIds[i];
        // Fixed link IDs: 001301 for worship series, 001302 for bible study
        const linkId =
          seed.id === "00000000-0000-4000-8000-000000001001"
            ? "00000000-0000-4000-8000-000000001301"
            : seed.id === "00000000-0000-4000-8000-000000001002"
              ? "00000000-0000-4000-8000-000000001302"
              : seed.id === "00000000-0000-4000-8000-000000001003"
                ? "00000000-0000-4000-8000-000000001303"
                : `00000000-0000-4000-8000-00000000130${i}`;
        await prisma.eventMinistry.upsert({
          where: { id: linkId },
          update: {
            eventId: seed.id,
            ministryId,
            isPrimary: i === 0,
          },
          create: {
            id: linkId,
            eventId: seed.id,
            ministryId,
            isPrimary: i === 0,
          },
        });
      }
    }
  }

  // Generate a few child occurrences for the two recurring series (idempotent by fixed IDs)
  const recurringParents = [
    {
      parentId: "00000000-0000-4000-8000-000000001001",
      occId: "00000000-0000-4000-8000-0000000010d1",
      daysOffset: 9,
      slug: "sunday-morning-worship-occ-1",
    },
    {
      parentId: "00000000-0000-4000-8000-000000001002",
      occId: "00000000-0000-4000-8000-0000000010d2",
      daysOffset: 11,
      slug: "midweek-bible-study-occ-1",
    },
  ];

  for (const occ of recurringParents) {
    const parent = await prisma.event.findUnique({ where: { id: occ.parentId } });
    if (!parent) continue;
    const start = daysFromNow(occ.daysOffset, parent.startDateTime.getUTCHours());
    const duration =
      parent.endDateTime.getTime() - parent.startDateTime.getTime();
    await prisma.event.upsert({
      where: { id: occ.occId },
      update: {
        organizationId: demoOrganization.id,
        title: parent.title,
        slug: occ.slug,
        parentEventId: parent.id,
        startDateTime: start,
        endDateTime: new Date(start.getTime() + duration),
        eventStatus: EventStatus.PUBLISHED,
        visibility: parent.visibility,
        categoryId: parent.categoryId,
        locationId: parent.locationId,
        createdByUserId: demoAdmin.id,
      },
      create: {
        id: occ.occId,
        organizationId: demoOrganization.id,
        title: parent.title,
        slug: occ.slug,
        shortDescription: parent.shortDescription,
        categoryId: parent.categoryId,
        locationId: parent.locationId,
        eventStatus: EventStatus.PUBLISHED,
        visibility: parent.visibility,
        startDateTime: start,
        endDateTime: new Date(start.getTime() + duration),
        timezone: parent.timezone,
        parentEventId: parent.id,
        createdByUserId: demoAdmin.id,
        publishedAt: start,
      },
    });
  }

  console.log("Seeded event categories, locations, and demo events");

  // ---------------------------------------------------------------------------
  // Blueprint 7.2 – Event registration / waitlist / check-in fixtures
  // Fixed UUID band: ...0000000012xx
  // ---------------------------------------------------------------------------

  const registrationEventIds = [
    "00000000-0000-4000-8000-000000001003", // Youth Night capacity 60
    "00000000-0000-4000-8000-000000001004", // Outreach capacity 40
    "00000000-0000-4000-8000-000000001005", // Newcomers capacity 30 — near-full for waitlist
  ] as const;

  const settingsSeeds = [
    {
      id: "00000000-0000-4000-8000-000000001201",
      eventId: registrationEventIds[0],
      capacity: 60,
      waitlistEnabled: true,
      waitlistCapacity: 20,
      promotionMode: "AUTOMATIC" as const,
      maxAttendeesPerRegistration: 4,
    },
    {
      id: "00000000-0000-4000-8000-000000001202",
      eventId: registrationEventIds[1],
      capacity: 40,
      waitlistEnabled: true,
      waitlistCapacity: 10,
      promotionMode: "STAFF_APPROVAL" as const,
      maxAttendeesPerRegistration: 2,
    },
    {
      id: "00000000-0000-4000-8000-000000001203",
      eventId: registrationEventIds[2],
      capacity: 2, // tiny capacity so waitlist / promotion demos work
      waitlistEnabled: true,
      waitlistCapacity: 10,
      promotionMode: "AUTOMATIC" as const,
      maxAttendeesPerRegistration: 2,
    },
  ];

  for (const settings of settingsSeeds) {
    await prisma.eventRegistrationSettings.upsert({
      where: { eventId: settings.eventId },
      update: {
        organizationId: demoOrganization.id,
        isEnabled: true,
        visibility: "PUBLIC",
        capacity: settings.capacity,
        waitlistEnabled: settings.waitlistEnabled,
        waitlistCapacity: settings.waitlistCapacity,
        promotionMode: settings.promotionMode,
        maxAttendeesPerRegistration: settings.maxAttendeesPerRegistration,
        allowGuestRegistration: true,
        allowHouseholdRegistration: true,
        requireEmail: true,
        allowCancellation: true,
        checkInEnabled: true,
        qrCheckInEnabled: true,
        showCapacityPublicly: true,
        showWaitlistPublicly: true,
        instructions: "Demo registration — please arrive 10 minutes early.",
      },
      create: {
        id: settings.id,
        organizationId: demoOrganization.id,
        eventId: settings.eventId,
        isEnabled: true,
        visibility: "PUBLIC",
        capacity: settings.capacity,
        waitlistEnabled: settings.waitlistEnabled,
        waitlistCapacity: settings.waitlistCapacity,
        promotionMode: settings.promotionMode,
        maxAttendeesPerRegistration: settings.maxAttendeesPerRegistration,
        allowGuestRegistration: true,
        allowHouseholdRegistration: true,
        requireEmail: true,
        allowCancellation: true,
        checkInEnabled: true,
        qrCheckInEnabled: true,
        showCapacityPublicly: true,
        showWaitlistPublicly: true,
        instructions: "Demo registration — please arrive 10 minutes early.",
      },
    });

    await prisma.event.update({
      where: { id: settings.eventId },
      data: {
        registrationRequired: true,
        registrationCapacity: settings.capacity,
        waitlistEnabled: settings.waitlistEnabled,
        registrationInstructions:
          "Demo registration — please arrive 10 minutes early.",
      },
    });
  }

  type SeedReg = {
    id: string;
    eventId: string;
    status: "CONFIRMED" | "WAITLISTED" | "CANCELLED" | "CHECKED_IN";
    code: string;
    contactName: string;
    contactEmail: string;
    waitlistPosition?: number;
    memberId?: string;
    attendees: Array<{
      id: string;
      firstName: string;
      lastName: string;
      status: "CONFIRMED" | "WAITLISTED" | "CANCELLED" | "CHECKED_IN";
      memberId?: string;
      isGuest?: boolean;
      checkInToken: string;
      checkedInAt?: Date;
    }>;
  };

  const registrationSeeds: SeedReg[] = [
    {
      id: "00000000-0000-4000-8000-000000001210",
      eventId: registrationEventIds[0],
      status: "CONFIRMED",
      code: "YOUTH001",
      contactName: "Alex Rivera",
      contactEmail: "alex.rivera@example.com",
      memberId: "00000000-0000-4000-8000-000000000201",
      attendees: [
        {
          id: "00000000-0000-4000-8000-000000001230",
          firstName: "Alex",
          lastName: "Rivera",
          status: "CONFIRMED",
          memberId: "00000000-0000-4000-8000-000000000201",
          checkInToken: "seedcheckintoken0000000000000001",
        },
      ],
    },
    {
      id: "00000000-0000-4000-8000-000000001211",
      eventId: registrationEventIds[0],
      status: "CHECKED_IN",
      code: "YOUTH002",
      contactName: "Jordan Lee",
      contactEmail: "jordan.lee@example.com",
      attendees: [
        {
          id: "00000000-0000-4000-8000-000000001231",
          firstName: "Jordan",
          lastName: "Lee",
          status: "CHECKED_IN",
          checkInToken: "seedcheckintoken0000000000000002",
          checkedInAt: new Date(),
        },
        {
          id: "00000000-0000-4000-8000-000000001232",
          firstName: "Sam",
          lastName: "Lee",
          status: "CHECKED_IN",
          isGuest: true,
          checkInToken: "seedcheckintoken0000000000000003",
          checkedInAt: new Date(),
        },
      ],
    },
    {
      id: "00000000-0000-4000-8000-000000001212",
      eventId: registrationEventIds[1],
      status: "CONFIRMED",
      code: "OUTRCH01",
      contactName: "Casey Morgan",
      contactEmail: "casey.morgan@example.com",
      attendees: [
        {
          id: "00000000-0000-4000-8000-000000001233",
          firstName: "Casey",
          lastName: "Morgan",
          status: "CONFIRMED",
          checkInToken: "seedcheckintoken0000000000000004",
        },
      ],
    },
    {
      id: "00000000-0000-4000-8000-000000001213",
      eventId: registrationEventIds[1],
      status: "WAITLISTED",
      code: "OUTRCH02",
      contactName: "Riley Quinn",
      contactEmail: "riley.quinn@example.com",
      waitlistPosition: 1,
      attendees: [
        {
          id: "00000000-0000-4000-8000-000000001234",
          firstName: "Riley",
          lastName: "Quinn",
          status: "WAITLISTED",
          checkInToken: "seedcheckintoken0000000000000005",
        },
      ],
    },
    {
      id: "00000000-0000-4000-8000-000000001214",
      eventId: registrationEventIds[1],
      status: "CANCELLED",
      code: "OUTRCH03",
      contactName: "Taylor Brooks",
      contactEmail: "taylor.brooks@example.com",
      attendees: [
        {
          id: "00000000-0000-4000-8000-000000001235",
          firstName: "Taylor",
          lastName: "Brooks",
          status: "CANCELLED",
          checkInToken: "seedcheckintoken0000000000000006",
        },
      ],
    },
    // Newcomers lunch: capacity 2 — fill then waitlist (promotion scenario)
    {
      id: "00000000-0000-4000-8000-000000001215",
      eventId: registrationEventIds[2],
      status: "CONFIRMED",
      code: "NEWCOM01",
      contactName: "Morgan Blake",
      contactEmail: "morgan.blake@example.com",
      attendees: [
        {
          id: "00000000-0000-4000-8000-000000001236",
          firstName: "Morgan",
          lastName: "Blake",
          status: "CONFIRMED",
          checkInToken: "seedcheckintoken0000000000000007",
        },
      ],
    },
    {
      id: "00000000-0000-4000-8000-000000001216",
      eventId: registrationEventIds[2],
      status: "CONFIRMED",
      code: "NEWCOM02",
      contactName: "Avery Chen",
      contactEmail: "avery.chen@example.com",
      attendees: [
        {
          id: "00000000-0000-4000-8000-000000001237",
          firstName: "Avery",
          lastName: "Chen",
          status: "CONFIRMED",
          checkInToken: "seedcheckintoken0000000000000008",
        },
      ],
    },
    {
      id: "00000000-0000-4000-8000-000000001217",
      eventId: registrationEventIds[2],
      status: "WAITLISTED",
      code: "NEWCOM03",
      contactName: "Jamie Park",
      contactEmail: "jamie.park@example.com",
      waitlistPosition: 1,
      attendees: [
        {
          id: "00000000-0000-4000-8000-000000001238",
          firstName: "Jamie",
          lastName: "Park",
          status: "WAITLISTED",
          checkInToken: "seedcheckintoken0000000000000009",
        },
      ],
    },
    {
      id: "00000000-0000-4000-8000-000000001218",
      eventId: registrationEventIds[0],
      status: "WAITLISTED",
      code: "YOUTH003",
      contactName: "Chris Nguyen",
      contactEmail: "chris.nguyen@example.com",
      waitlistPosition: 1,
      attendees: [
        {
          id: "00000000-0000-4000-8000-000000001239",
          firstName: "Chris",
          lastName: "Nguyen",
          status: "WAITLISTED",
          checkInToken: "seedcheckintoken0000000000000010",
        },
      ],
    },
  ];

  for (const reg of registrationSeeds) {
    await prisma.eventRegistration.upsert({
      where: { id: reg.id },
      update: {
        organizationId: demoOrganization.id,
        eventId: reg.eventId,
        status: reg.status,
        source: "PUBLIC_GUEST",
        confirmationCode: reg.code,
        primaryContactName: reg.contactName,
        primaryContactEmail: reg.contactEmail,
        partySize: reg.attendees.length,
        waitlistPosition: reg.waitlistPosition ?? null,
        memberId: reg.memberId ?? null,
        confirmedAt:
          reg.status === "CONFIRMED" || reg.status === "CHECKED_IN"
            ? new Date()
            : null,
        cancelledAt: reg.status === "CANCELLED" ? new Date() : null,
        checkedInAt: reg.status === "CHECKED_IN" ? new Date() : null,
      },
      create: {
        id: reg.id,
        organizationId: demoOrganization.id,
        eventId: reg.eventId,
        status: reg.status,
        source: "PUBLIC_GUEST",
        confirmationCode: reg.code,
        primaryContactName: reg.contactName,
        primaryContactEmail: reg.contactEmail,
        partySize: reg.attendees.length,
        waitlistPosition: reg.waitlistPosition ?? null,
        memberId: reg.memberId ?? null,
        confirmedAt:
          reg.status === "CONFIRMED" || reg.status === "CHECKED_IN"
            ? new Date()
            : null,
        cancelledAt: reg.status === "CANCELLED" ? new Date() : null,
        checkedInAt: reg.status === "CHECKED_IN" ? new Date() : null,
      },
    });

    for (const attendee of reg.attendees) {
      await prisma.eventAttendee.upsert({
        where: { id: attendee.id },
        update: {
          organizationId: demoOrganization.id,
          registrationId: reg.id,
          eventId: reg.eventId,
          status: attendee.status,
          attendeeType: attendee.memberId
            ? "MEMBER"
            : attendee.isGuest
              ? "GUEST"
              : "GUEST",
          firstName: attendee.firstName,
          lastName: attendee.lastName,
          memberId: attendee.memberId ?? null,
          isGuest: Boolean(attendee.isGuest),
          checkInToken: attendee.checkInToken,
          checkedInAt: attendee.checkedInAt ?? null,
          waitlistPosition: reg.waitlistPosition ?? null,
        },
        create: {
          id: attendee.id,
          organizationId: demoOrganization.id,
          registrationId: reg.id,
          eventId: reg.eventId,
          status: attendee.status,
          attendeeType: attendee.memberId ? "MEMBER" : "GUEST",
          firstName: attendee.firstName,
          lastName: attendee.lastName,
          memberId: attendee.memberId ?? null,
          isGuest: Boolean(attendee.isGuest),
          checkInToken: attendee.checkInToken,
          checkedInAt: attendee.checkedInAt ?? null,
          waitlistPosition: reg.waitlistPosition ?? null,
        },
      });
    }

    if (reg.status === "WAITLISTED" && reg.waitlistPosition != null) {
      await prisma.eventWaitlistEntry.upsert({
        where: { registrationId: reg.id },
        update: {
          organizationId: demoOrganization.id,
          eventId: reg.eventId,
          position: reg.waitlistPosition,
          partySize: reg.attendees.length,
          status: "WAITING",
        },
        create: {
          organizationId: demoOrganization.id,
          eventId: reg.eventId,
          registrationId: reg.id,
          position: reg.waitlistPosition,
          partySize: reg.attendees.length,
          status: "WAITING",
        },
      });
    }
  }

  // Waitlist promotion scenario: cancel a confirmed newcomers spot so AUTOMATIC
  // promotion can offer NEWCOM03 when staff cancels NEWCOM02 (OFFERED → accept).
  // Blueprint 7.3 – enable check-in on seeded registration demo events
  for (const eventId of registrationEventIds) {
    await prisma.eventCheckInSettings.upsert({
      where: { eventId },
      update: {
        organizationId: demoOrganization.id,
        checkInEnabled: true,
        allowWalkIns: eventId === registrationEventIds[0],
        requireRegistration: eventId !== registrationEventIds[0],
        allowCheckOut: true,
        allowReentry: true,
        qrPassEnabled: true,
        allowSelfCheckIn: false,
      },
      create: {
        organizationId: demoOrganization.id,
        eventId,
        checkInEnabled: true,
        allowWalkIns: eventId === registrationEventIds[0],
        requireRegistration: eventId !== registrationEventIds[0],
        allowCheckOut: true,
        allowReentry: true,
        qrPassEnabled: true,
        allowSelfCheckIn: false,
      },
    });
  }

  console.log(
    "Seeded event registration, waitlist offers, and check-in settings demos",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
