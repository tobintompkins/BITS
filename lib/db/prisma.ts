import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/app/generated/prisma/client";

type PrismaClientInstance = InstanceType<typeof PrismaClient>;

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClientInstance;
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
] as const;

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required to use Prisma.");
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
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
  if (isCurrentPrismaClient(globalForPrisma.prisma)) {
    return globalForPrisma.prisma!;
  }

  const client = createPrismaClient();
  globalForPrisma.prisma = client;
  return client;
}

export const prisma = getPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
