/**
 * Duplicate scan runner abstraction.
 *
 * Today this runs synchronously in-process (server action / request path).
 * Future Blueprint work can swap `runDuplicateScanJob` for a background queue
 * (e.g. Inngest, BullMQ, or a cron worker) without changing scoring or
 * persistence callers — pass the same `DuplicateScanJobInput` and handle
 * `DuplicateScanJobResult`.
 */

import {
  collectBucketedPairIds,
  orderMemberPairIds,
  scoreMemberPair,
  type DuplicateScoreInput,
} from "@/lib/members/duplicate-scoring";
import { DUPLICATE_SCORE_THRESHOLD } from "@/lib/constants/member-lifecycle";

/** Soft cap to keep sync scans responsive; raise when moving to a job queue. */
export const DUPLICATE_SCAN_MEMBER_CAP = 2000;

export type DuplicateScanJobInput = {
  members: DuplicateScoreInput[];
  /** Existing ordered pair keys (`memberAId|memberBId`). */
  existingPairKeys: Set<string>;
  scoreThreshold?: number;
  memberCap?: number;
};

export type DuplicateScanCandidate = {
  memberAId: string;
  memberBId: string;
  matchScore: number;
  matchReasons: string[];
};

export type DuplicateScanJobResult = {
  candidates: DuplicateScanCandidate[];
  created: number;
  skippedExisting: number;
  belowThreshold: number;
  membersScanned: number;
  membersTotal: number;
  truncated: boolean;
  message?: string;
};

/**
 * Pure sync runner: bucket → score shared-bucket pairs → skip known pairs.
 * Persistence (createDuplicateCandidate) stays in the service layer.
 */
export function runDuplicateScanJob(
  input: DuplicateScanJobInput,
): DuplicateScanJobResult {
  const cap = input.memberCap ?? DUPLICATE_SCAN_MEMBER_CAP;
  const threshold = input.scoreThreshold ?? DUPLICATE_SCORE_THRESHOLD;
  const membersTotal = input.members.length;
  const truncated = membersTotal > cap;
  const members = truncated ? input.members.slice(0, cap) : input.members;

  const byId = new Map(members.map((member) => [member.id, member]));
  const pairs = collectBucketedPairIds(members);

  const candidates: DuplicateScanCandidate[] = [];
  let skippedExisting = 0;
  let belowThreshold = 0;

  for (const [leftId, rightId] of pairs) {
    const left = byId.get(leftId);
    const right = byId.get(rightId);
    if (!left || !right) continue;

    const [memberAId, memberBId] = orderMemberPairIds(left.id, right.id);
    const pairKey = `${memberAId}|${memberBId}`;
    if (input.existingPairKeys.has(pairKey)) {
      skippedExisting += 1;
      continue;
    }

    const { score, reasons } = scoreMemberPair(left, right);
    if (score < threshold) {
      belowThreshold += 1;
      continue;
    }

    candidates.push({
      memberAId,
      memberBId,
      matchScore: score,
      matchReasons: reasons,
    });
  }

  return {
    candidates,
    created: candidates.length,
    skippedExisting,
    belowThreshold,
    membersScanned: members.length,
    membersTotal,
    truncated,
    message: truncated
      ? `Scan limited to the first ${cap} members (${membersTotal} total). Run again after reviewing, or move scanning to a background job for larger directories.`
      : undefined,
  };
}
