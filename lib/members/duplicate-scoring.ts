/**
 * Duplicate detection scoring for member records.
 *
 * Weights (suggested by Blueprint 6.6):
 * - Exact email: 90
 * - Exact normalized phone: 85
 * - Name + DOB: 90
 * - Name + address: 70
 * - Exact first+last name: 35
 * - Preferred name match: 20
 * - Similar spelling: 25
 * - Household relationship: 15
 * - Alternate phone match: 60
 *
 * Candidates are only created for human review (never auto-merged).
 */

export type DuplicateScoreInput = {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  email: string | null;
  phone: string | null;
  alternatePhone: string | null;
  dateOfBirth: Date | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  recordStatus: string;
  householdIds: string[];
};

export type DuplicateMatchResult = {
  score: number;
  reasons: string[];
};

export function normalizeEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() || "";
}

export function normalizePhone(phone: string | null | undefined) {
  if (!phone) return "";
  return phone.replace(/\D/g, "");
}

export function normalizeName(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") || "";
}

function normalizeAddressPart(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/[.,#]/g, "").replace(/\s+/g, " ") || "";
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array(b.length + 1).fill(0),
  );
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[a.length][b.length];
}

function similarName(a: string, b: string) {
  if (!a || !b) return false;
  if (a === b) return true;
  const distance = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen > 0 && distance / maxLen <= 0.25;
}

function sameDay(a: Date | null, b: Date | null) {
  if (!a || !b) return false;
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

export function scoreMemberPair(
  left: DuplicateScoreInput,
  right: DuplicateScoreInput,
): DuplicateMatchResult {
  const reasons: string[] = [];
  let score = 0;

  const leftEmail = normalizeEmail(left.email);
  const rightEmail = normalizeEmail(right.email);
  if (leftEmail && rightEmail && leftEmail === rightEmail) {
    score += 90;
    reasons.push("Exact email match");
  }

  const leftPhone = normalizePhone(left.phone);
  const rightPhone = normalizePhone(right.phone);
  const leftAlt = normalizePhone(left.alternatePhone);
  const rightAlt = normalizePhone(right.alternatePhone);

  if (leftPhone && rightPhone && leftPhone === rightPhone) {
    score += 85;
    reasons.push("Exact phone match");
  } else if (
    (leftPhone && (leftPhone === rightAlt || leftPhone === rightPhone)) ||
    (rightPhone && (rightPhone === leftAlt || rightPhone === leftPhone)) ||
    (leftAlt && rightAlt && leftAlt === rightAlt)
  ) {
    if (!reasons.includes("Exact phone match")) {
      score += 60;
      reasons.push("Alternate or related phone match");
    }
  }

  const leftFirst = normalizeName(left.firstName);
  const leftLast = normalizeName(left.lastName);
  const rightFirst = normalizeName(right.firstName);
  const rightLast = normalizeName(right.lastName);
  const exactName = leftFirst === rightFirst && leftLast === rightLast;
  const similar =
    similarName(leftFirst, rightFirst) && similarName(leftLast, rightLast);

  if (exactName && sameDay(left.dateOfBirth, right.dateOfBirth)) {
    score += 90;
    reasons.push("Name plus date of birth match");
  } else if (exactName) {
    score += 35;
    reasons.push("Exact first and last name match");
  } else if (similar) {
    score += 25;
    reasons.push("Similar spelling of name");
  }

  const leftPreferred = normalizeName(left.preferredName);
  const rightPreferred = normalizeName(right.preferredName);
  if (
    leftPreferred &&
    rightPreferred &&
    (leftPreferred === rightPreferred ||
      leftPreferred === rightFirst ||
      rightPreferred === leftFirst)
  ) {
    score += 20;
    reasons.push("Preferred name match");
  }

  const leftAddress = [
    normalizeAddressPart(left.addressLine1),
    normalizeAddressPart(left.city),
    normalizeAddressPart(left.state),
    normalizeAddressPart(left.postalCode),
  ].join("|");
  const rightAddress = [
    normalizeAddressPart(right.addressLine1),
    normalizeAddressPart(right.city),
    normalizeAddressPart(right.state),
    normalizeAddressPart(right.postalCode),
  ].join("|");

  if (
    left.addressLine1 &&
    right.addressLine1 &&
    leftAddress === rightAddress &&
    (exactName || similar)
  ) {
    score += 70;
    reasons.push("Name plus address match");
  }

  const sharedHousehold = left.householdIds.some((id) =>
    right.householdIds.includes(id),
  );
  if (sharedHousehold) {
    score += 15;
    reasons.push("Shared household");
  }

  if (
    left.recordStatus === "ARCHIVED" ||
    right.recordStatus === "ARCHIVED" ||
    left.recordStatus === "MERGED" ||
    right.recordStatus === "MERGED"
  ) {
    reasons.push("Includes archived or merged historical record");
  }

  return { score: Math.min(score, 100), reasons };
}

export function orderMemberPairIds(idA: string, idB: string) {
  return idA < idB ? ([idA, idB] as const) : ([idB, idA] as const);
}

/** Bucket key for exact email matches. Empty when email is missing. */
export function emailBucketKey(email: string | null | undefined) {
  const normalized = normalizeEmail(email);
  return normalized ? `email:${normalized}` : null;
}

/** Bucket key for exact phone matches. Empty when phone is missing. */
export function phoneBucketKey(phone: string | null | undefined) {
  const normalized = normalizePhone(phone);
  return normalized ? `phone:${normalized}` : null;
}

/**
 * Bucket key for lastName + first-name initial (cheap name clustering).
 * Also used for same-last-name optional pairing via lastNameBucketKey.
 */
export function nameInitialBucketKey(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
) {
  const last = normalizeName(lastName);
  const first = normalizeName(firstName);
  if (!last || !first) return null;
  return `name:${last}|${first[0]}`;
}

/** Same last-name bucket for optional broader pairing. */
export function lastNameBucketKey(lastName: string | null | undefined) {
  const last = normalizeName(lastName);
  return last ? `lastname:${last}` : null;
}

export type BucketableMember = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  alternatePhone: string | null;
};

/**
 * Build candidate pair ids that share at least one bucket.
 * Pairs are ordered and de-duplicated.
 */
export function collectBucketedPairIds(members: BucketableMember[]) {
  const buckets = new Map<string, string[]>();

  function addToBucket(key: string | null, memberId: string) {
    if (!key) return;
    const list = buckets.get(key);
    if (list) {
      list.push(memberId);
    } else {
      buckets.set(key, [memberId]);
    }
  }

  for (const member of members) {
    addToBucket(emailBucketKey(member.email), member.id);
    addToBucket(phoneBucketKey(member.phone), member.id);
    addToBucket(phoneBucketKey(member.alternatePhone), member.id);
    addToBucket(nameInitialBucketKey(member.firstName, member.lastName), member.id);
    addToBucket(lastNameBucketKey(member.lastName), member.id);
  }

  const pairKeys = new Set<string>();
  const pairs: Array<[string, string]> = [];

  for (const ids of buckets.values()) {
    if (ids.length < 2) continue;
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const [a, b] = orderMemberPairIds(ids[i], ids[j]);
        const key = `${a}|${b}`;
        if (pairKeys.has(key)) continue;
        pairKeys.add(key);
        pairs.push([a, b]);
      }
    }
  }

  return pairs;
}

