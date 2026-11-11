import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/app/generated/prisma/client";
import { acquirePrismaClient } from "@/lib/db/prisma-acquire";

type PrismaClientInstance = InstanceType<typeof PrismaClient>;

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClientInstance;
  prismaTargetKey?: string;
};

/**
 * Expected delegates that must exist on a current client.
 * If a long-lived Next.js process cached an older PrismaClient (from before
 * schema models were added), recreate the client instead of crashing on
 * `undefined.findMany()`.
 */
const REQUIRED_DELEGATES = [
  "member",
  "ministry",
  "memberAttendance",
  "event",
  "eventRegistration",
  "stripeWebhookEvent",
  "statementVoidRequest",
  "churchAnnouncement",
  "churchAnnouncementReadReceipt",
  "memberPrivacyDataRequest",
  "memberVolunteerAvailability",
  "volunteerServiceAssignment",
  "volunteerTimeOffRequest",
  "volunteerSubstituteRequest",
  "equipmentItem",
  "maintenanceRequest",
  "purchaseRequest",
  "leadershipDocument",
  "equipmentCheckout",
  "dataRetentionPolicy",
  "backupReadinessLog",
  "churchServiceAlert",
  "memberApprovedPickup",
  "childPickupCheckoutVerification",
] as const;

function createPrismaClient(connectionString: string) {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      ...(process.env.VITEST && process.env.BITS_ISOLATED_DATABASE === "1"
        ? { max: 3 }
        : process.env.BITS_E2E_ACCEPTANCE === "1"
          ? { max: 2 }
          : {}),
    }),
  });
}

function clientHasMemberPortalLink(client: PrismaClientInstance) {
  const models = (
    client as unknown as {
      _runtimeDataModel?: {
        models?: Record<string, { fields?: Record<string, unknown> }>;
      };
    }
  )._runtimeDataModel?.models;
  return Boolean(models?.Member?.fields?.userAccountId);
}

function isCurrentPrismaClient(client: PrismaClientInstance | undefined) {
  if (!client) return false;
  const hasDelegates = REQUIRED_DELEGATES.every((name) => {
    const delegate = (client as unknown as Record<string, unknown>)[name];
    return typeof delegate === "object" && delegate != null;
  });
  return hasDelegates && clientHasMemberPortalLink(client);
}

function getPrismaClient() {
  return acquirePrismaClient({
    env: process.env,
    cache: globalForPrisma,
    isCurrent: isCurrentPrismaClient,
    create: createPrismaClient,
  });
}

export const prisma = new Proxy({} as PrismaClientInstance, {
  get(_target, prop, receiver) {
    const client = getPrismaClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
  has(_target, prop) {
    return prop in getPrismaClient();
  },
});
