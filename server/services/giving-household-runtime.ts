import { AsyncLocalStorage } from "node:async_hooks";

import type { PrismaClient } from "@/app/generated/prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";

export type GivingHouseholdTx = {
  $queryRaw: <T>(
    query: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<T>;
};

export type GivingHouseholdSeams = {
  afterLocks?: (tx: GivingHouseholdTx) => Promise<void> | void;
  onTransactionStart?: (tx: GivingHouseholdTx) => Promise<void> | void;
  failAudit?: boolean;
  now?: () => number;
};

const clientStore = new AsyncLocalStorage<PrismaClient>();
const seamStore = new AsyncLocalStorage<GivingHouseholdSeams>();

export function givingHouseholdPrisma() {
  return clientStore.getStore() ?? defaultPrisma;
}

export function runWithGivingHouseholdPrisma<T>(
  client: PrismaClient,
  fn: () => Promise<T>,
) {
  return clientStore.run(client, fn);
}

export function runWithGivingHouseholdSeams<T>(
  seams: GivingHouseholdSeams,
  fn: () => Promise<T>,
) {
  const parent = seamStore.getStore() ?? {};
  return seamStore.run({ ...parent, ...seams }, fn);
}

function currentSeams() {
  return seamStore.getStore();
}

export function givingHouseholdNow() {
  return currentSeams()?.now?.() ?? Date.now();
}

export async function notifyGivingHouseholdTransactionStarted(
  tx: GivingHouseholdTx,
) {
  await currentSeams()?.onTransactionStart?.(tx);
}

export async function notifyGivingHouseholdLocksAcquired(tx: GivingHouseholdTx) {
  await currentSeams()?.afterLocks?.(tx);
}

export function consumeGivingHouseholdAuditFailure() {
  const seams = currentSeams();
  if (!seams?.failAudit) return false;
  seams.failAudit = false;
  return true;
}
