import {
  runWithGivingHouseholdSeams,
  type GivingHouseholdTx,
} from "@/server/services/giving-household-runtime";

export const GIVING_HOUSEHOLD_LOCK_WAIT_MS = 5_000;

export type GivingHouseholdLockObserver = {
  $queryRaw: <T>(
    query: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<T>;
};

export async function givingHouseholdBackendPid(tx: GivingHouseholdTx) {
  const rows = await tx.$queryRaw<Array<{ pid: number | bigint }>>`
    SELECT pg_backend_pid() AS pid
  `;
  return Number(rows[0]?.pid);
}

export async function waitUntilGivingHouseholdBlocked(
  observer: GivingHouseholdLockObserver,
  waitingPid: number,
  blockingPid: number,
  lockWaitMs = GIVING_HOUSEHOLD_LOCK_WAIT_MS,
) {
  const deadline = Date.now() + lockWaitMs;
  while (Date.now() < deadline) {
    const rows = await observer.$queryRaw<Array<{ blocked: boolean }>>`
      SELECT ${blockingPid}::int = ANY (pg_blocking_pids(${waitingPid}::int)) AS blocked
    `;
    if (rows[0]?.blocked) return;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw new Error(
    `Timed out waiting for backend ${waitingPid} to be blocked by ${blockingPid}. This fails if household/donor FOR UPDATE locks are removed.`,
  );
}

function deferred<T>(lockWaitMs: number, timeoutMessage: string) {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  let settled = false;
  const cancelWaiters: Array<() => void> = [];
  const promise = new Promise<T>((res, rej) => {
    const timer = setTimeout(() => reject(new Error(timeoutMessage)), lockWaitMs);
    const finish = (apply: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      apply();
    };
    resolve = (value) => finish(() => res(value));
    reject = (error) => finish(() => rej(error));
    cancelWaiters.push(() => {
      finish(() => rej(new Error("lock-contention waiter cancelled")));
    });
  });
  promise.catch(() => undefined);
  return { promise, resolve, reject, cancelWaiters };
}

export async function runWithObservedLockContention<T, U>(
  observer: GivingHouseholdLockObserver,
  first: () => Promise<T>,
  second: () => Promise<U>,
  options?: { lockWaitMs?: number },
) {
  const lockWaitMs = options?.lockWaitMs ?? GIVING_HOUSEHOLD_LOCK_WAIT_MS;
  let releaseFirst = () => {};
  const firstMayFinish = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let firstEnteredCritical = false;
  const firstLocked = deferred<void>(
    lockWaitMs,
    "first writer never acquired locks",
  );
  const secondPidReady = deferred<number>(
    lockWaitMs,
    "second writer never entered a transaction",
  );
  let firstPid = 0;
  let secondPid = 0;
  let sawFirstStart = false;
  const started: Array<Promise<unknown>> = [];

  return runWithGivingHouseholdSeams(
    {
      onTransactionStart: async (tx) => {
        const pid = await givingHouseholdBackendPid(tx);
        if (!sawFirstStart) {
          sawFirstStart = true;
          firstPid = pid;
          return;
        }
        if (!secondPid) {
          secondPid = pid;
          secondPidReady.resolve(pid);
        }
      },
      afterLocks: async () => {
        if (firstEnteredCritical) return;
        firstEnteredCritical = true;
        firstLocked.resolve();
        await firstMayFinish;
      },
    },
    async () => {
      try {
        const firstP = first();
        started.push(firstP);
        await Promise.race([
          firstLocked.promise,
          firstP.then(
            () => {
              throw new Error("first writer finished before after-locks hook");
            },
            (error: unknown) => {
              throw error;
            },
          ),
        ]);
        const secondP = second();
        started.push(secondP);
        let observeError: unknown;
        try {
          await waitUntilGivingHouseholdBlocked(
            observer,
            await secondPidReady.promise,
            firstPid,
            lockWaitMs,
          );
        } catch (error) {
          observeError = error;
        } finally {
          releaseFirst();
        }
        const results = await Promise.allSettled([firstP, secondP]);
        if (observeError) throw observeError;
        return results;
      } finally {
        releaseFirst();
        for (const cancel of [
          ...firstLocked.cancelWaiters,
          ...secondPidReady.cancelWaiters,
        ]) {
          cancel();
        }
        await Promise.allSettled(started);
      }
    },
  );
}
