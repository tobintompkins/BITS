import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/app/generated/prisma/client";
import { isolatedConnectionString } from "@/lib/testing/isolated-database";
import {
  createAttendanceFoundationFixture,
  type AttendanceFoundationFixture,
} from "@/server/repositories/event-attendance.fixtures";

export async function loadIsolatedPrismaClient(): Promise<PrismaClient> {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: isolatedConnectionString(),
      max: 3,
    }),
  });
}

export async function startIsolatedAttendanceFixture() {
  const prisma = await loadIsolatedPrismaClient();
  try {
    const fx: AttendanceFoundationFixture =
      await createAttendanceFoundationFixture(prisma);
    return { prisma, fx };
  } catch (error) {
    await prisma.$disconnect().catch(() => undefined);
    throw error;
  }
}
