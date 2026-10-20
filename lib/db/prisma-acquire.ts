import {
  classifyIsolatedDatabaseRuntime,
  isolatedPrismaBlockedMessage,
} from "@/lib/testing/isolated-database";
import {
  parsePostgresTargetIdentity,
  postgresTargetIdentityKey,
} from "@/lib/testing/original-v1-database-url";

export type PrismaAcquireCache<T> = {
  prisma?: T;
  prismaTargetKey?: string;
};

export const CACHED_CLIENT_TARGET_MISMATCH =
  "Cached Prisma client targets a different database than the current isolated DATABASE_URL. Refusing to reuse or retarget the client.";

export function isolatedTargetKey(url: string) {
  const identity = parsePostgresTargetIdentity(url);
  return identity ? postgresTargetIdentityKey(identity) : "";
}

export function acquirePrismaClient<T>(input: {
  env: Record<string, string | undefined>;
  cache: PrismaAcquireCache<T>;
  isCurrent: (client: T | undefined) => boolean;
  create: (connectionString: string) => T;
}): T {
  if (input.env.VITEST) {
    if (input.env.BITS_ISOLATED_DATABASE !== "1") {
      throw new Error(isolatedPrismaBlockedMessage());
    }
    const runtime = classifyIsolatedDatabaseRuntime(input.env);
    if (!runtime.ok) {
      throw new Error(runtime.reason);
    }
    const targetKey = isolatedTargetKey(runtime.isolatedUrl);
    if (input.isCurrent(input.cache.prisma)) {
      if (input.cache.prismaTargetKey !== targetKey) {
        throw new Error(CACHED_CLIENT_TARGET_MISMATCH);
      }
      return input.cache.prisma!;
    }
    const client = input.create(runtime.isolatedUrl);
    input.cache.prisma = client;
    input.cache.prismaTargetKey = targetKey;
    return client;
  }

  const connectionString = input.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to use Prisma.");
  }
  if (input.isCurrent(input.cache.prisma)) {
    return input.cache.prisma!;
  }
  const client = input.create(connectionString);
  input.cache.prisma = client;
  input.cache.prismaTargetKey = isolatedTargetKey(connectionString);
  return client;
}
