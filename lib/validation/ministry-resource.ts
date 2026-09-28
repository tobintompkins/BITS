import { z } from "zod";

import { containsMarkup } from "@/lib/validation/church-announcement";
import { formatVolunteerTimeOffDate } from "@/lib/validation/volunteer-time-off-request";

export const MINISTRY_RESOURCE_TITLE_MIN = 3;
export const MINISTRY_RESOURCE_TITLE_MAX = 80;
export const MINISTRY_RESOURCE_DESCRIPTION_MAX = 280;
export const MINISTRY_RESOURCE_URL_MAX = 2048;
export const MINISTRY_RESOURCE_LINK_TARGET = "_blank";
export const MINISTRY_RESOURCE_LINK_REL = "noopener noreferrer";

export const MINISTRY_RESOURCE_STATUSES = ["DRAFT", "PUBLISHED"] as const;
export type MinistryResourceStatus = (typeof MINISTRY_RESOURCE_STATUSES)[number];

export const MINISTRY_RESOURCE_STATUS_LABELS: Record<
  MinistryResourceStatus,
  string
> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
};

export const STAFF_MINISTRY_RESOURCE_FILTERS = [
  "DRAFT",
  "PUBLISHED",
  "ARCHIVED",
] as const;

export type StaffMinistryResourceFilter =
  (typeof STAFF_MINISTRY_RESOURCE_FILTERS)[number];

export const STAFF_MINISTRY_RESOURCE_FILTER_LABELS: Record<
  StaffMinistryResourceFilter,
  string
> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

export const STAFF_MINISTRY_RESOURCE_NOTICE =
  "Publish approved HTTPS resource links for a ministry. This is not a file library, document store, or public directory.";

export const STAFF_MINISTRY_RESOURCE_EMPTY_COPY =
  "No ministry resources match this view.";

export const MEMBER_MINISTRY_RESOURCE_NOTICE =
  "These are published resource links for ministries you serve. This page is read-only and does not include drafts or files.";

export const MEMBER_MINISTRY_RESOURCE_EMPTY_COPY =
  "No published ministry resources are available for your assignments yet. Contact the church office if this information needs correction.";

export const MEMBER_MINISTRY_RESOURCE_PENDING_COPY =
  "Your account must be connected to your church membership record before ministry resources can appear. Contact the church office if this information needs correction.";

export const STAFF_MINISTRY_RESOURCE_ROW_FIELDS = [
  "resourceId",
  "ministryId",
  "ministryName",
  "title",
  "description",
  "url",
  "hostname",
  "status",
  "statusLabel",
  "updatedOnLabel",
  "archived",
] as const;

export const MEMBER_MINISTRY_RESOURCE_ROW_FIELDS = [
  "title",
  "description",
  "url",
] as const;

export const MEMBER_MINISTRY_RESOURCE_GROUP_FIELDS = [
  "ministryName",
  "resources",
] as const;

export type StaffMinistryResourceRow = {
  resourceId: string;
  ministryId: string;
  ministryName: string;
  title: string;
  description: string;
  url: string;
  hostname: string;
  status: MinistryResourceStatus;
  statusLabel: string;
  updatedOnLabel: string;
  archived: boolean;
};

export type MemberMinistryResourceRow = {
  title: string;
  description: string | null;
  url: string;
};

export type MemberMinistryResourceGroup = {
  ministryName: string;
  resources: MemberMinistryResourceRow[];
};

export type StaffMinistryResourceNavItem = {
  href: string;
  label: string;
};

export function staffMinistryResourceNavItems(
  canManageMinistries: boolean,
): StaffMinistryResourceNavItem[] {
  return canManageMinistries
    ? [{ href: "/ministry-resources", label: "Ministry Resources" }]
    : [];
}

export function staffMinistryResourcesHref(ministryId?: string) {
  if (!ministryId) return "/ministry-resources";
  return `/ministry-resources?ministryId=${encodeURIComponent(ministryId)}`;
}

export function formatMinistryResourceDate(value: Date) {
  return formatVolunteerTimeOffDate(value);
}

export function normalizeMinistryResourceText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function parseApprovedHttpsUrl(value: string) {
  const trimmed = value.trim();
  if (trimmed.length > MINISTRY_RESOURCE_URL_MAX) return null;
  if (!trimmed.toLowerCase().startsWith("https://")) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  if (!parsed.hostname.includes(".")) return null;
  if (parsed.hostname === "localhost" || parsed.hostname.endsWith(".local")) {
    return null;
  }
  return parsed.href;
}

export function ministryResourceHostname(url: string) {
  const parsed = parseApprovedHttpsUrl(url);
  if (!parsed) return null;
  return new URL(parsed).hostname;
}

export function ministryResourceLinkProps(url: string) {
  const href = parseApprovedHttpsUrl(url);
  if (!href) return null;
  return {
    href,
    target: MINISTRY_RESOURCE_LINK_TARGET,
    rel: MINISTRY_RESOURCE_LINK_REL,
  };
}

function firstString(value: unknown) {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

function optionalText(value: unknown) {
  const text = firstString(value)?.trim() ?? "";
  return text === "" ? undefined : text;
}

const titleSchema = z
  .string()
  .trim()
  .min(MINISTRY_RESOURCE_TITLE_MIN, {
    error: "Title must be 3–80 characters.",
  })
  .max(MINISTRY_RESOURCE_TITLE_MAX, {
    error: "Title must be 3–80 characters.",
  })
  .refine((value) => !containsMarkup(value), {
    error: "Use plain text only. HTML and markup are not allowed.",
  });

const descriptionSchema = z
  .string()
  .trim()
  .max(MINISTRY_RESOURCE_DESCRIPTION_MAX, {
    error: "Keep the description to 280 characters or fewer.",
  })
  .refine((value) => !containsMarkup(value), {
    error: "Use plain text only. HTML and markup are not allowed.",
  });

const httpsUrlSchema = z.string().refine((value) => parseApprovedHttpsUrl(value), {
  error: "Enter an https:// link only.",
});

export function parseStaffMinistryResourceFilter(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const status = optionalText(record.status);
  const ministryId = optionalText(record.ministryId);
  if (ministryId && !z.string().uuid().safeParse(ministryId).success) {
    return { success: false as const };
  }
  if (!status) {
    return {
      success: true as const,
      data: { status: null, ministryId: ministryId ?? null },
    };
  }
  const parsed = z.enum(STAFF_MINISTRY_RESOURCE_FILTERS).safeParse(status);
  if (!parsed.success) return { success: false as const };
  return {
    success: true as const,
    data: { status: parsed.data, ministryId: ministryId ?? null },
  };
}

export function parseMinistryResourceCreate(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const title = optionalText(record.title);
  const description = optionalText(record.description);
  return z
    .object({
      ministryId: z.string().uuid(),
      title: titleSchema,
      description: descriptionSchema.optional(),
      url: httpsUrlSchema,
    })
    .safeParse({
      ministryId: firstString(record.ministryId),
      title: title ? normalizeMinistryResourceText(title) : title,
      description: description
        ? normalizeMinistryResourceText(description)
        : undefined,
      url: firstString(record.url),
    });
}

export function parseMinistryResourceUpdate(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const title = optionalText(record.title);
  const description = optionalText(record.description);
  return z
    .object({
      resourceId: z.string().uuid(),
      ministryId: z.string().uuid(),
      title: titleSchema,
      description: descriptionSchema.optional(),
      url: httpsUrlSchema,
    })
    .safeParse({
      resourceId: firstString(record.resourceId),
      ministryId: firstString(record.ministryId),
      title: title ? normalizeMinistryResourceText(title) : title,
      description: description
        ? normalizeMinistryResourceText(description)
        : undefined,
      url: firstString(record.url),
    });
}

export function parseMinistryResourceId(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  return z
    .string()
    .uuid()
    .safeParse(typeof input === "string" ? input : firstString(record.resourceId));
}
