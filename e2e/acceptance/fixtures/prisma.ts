import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/app/generated/prisma/client";
import type { OriginalV1AcceptanceConfig } from "@/lib/testing/original-v1-acceptance-config";

export function createOriginalV1AcceptancePrisma(
  config: OriginalV1AcceptanceConfig,
) {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: config.e2eDatabaseUrl }),
  });
}
