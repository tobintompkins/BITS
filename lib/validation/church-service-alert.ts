import { z } from "zod";

import { containsMarkup } from "@/lib/validation/church-announcement";

export const CHURCH_SERVICE_ALERTS_HREF = "/service-alerts";

export const CHURCH_SERVICE_ALERTS_SUBTITLE =
  "Publish a temporary public notice for weather, cancellations, delays, or service changes.";

export const CHURCH_SERVICE_ALERTS_NOTICE =
  "Publishing an alert updates the public BITS home page. This page does not send text messages or email.";

export const CHURCH_SERVICE_ALERTS_EMPTY_COPY =
  "No church service alerts have been recorded yet.";

export const CHURCH_SERVICE_ALERT_TITLE_MIN = 3;
export const CHURCH_SERVICE_ALERT_TITLE_MAX = 80;
export const CHURCH_SERVICE_ALERT_MESSAGE_MIN = 10;
export const CHURCH_SERVICE_ALERT_MESSAGE_MAX = 280;

export const CHURCH_SERVICE_ALERT_TYPES = [
  "WEATHER",
  "CANCELLATION",
  "DELAY",
  "SERVICE_CHANGE",
  "GENERAL",
] as const;

export type ChurchServiceAlertType = (typeof CHURCH_SERVICE_ALERT_TYPES)[number];

export const CHURCH_SERVICE_ALERT_TYPE_LABELS: Record<
  ChurchServiceAlertType,
  string
> = {
  WEATHER: "Weather",
  CANCELLATION: "Cancellation",
  DELAY: "Delay",
  SERVICE_CHANGE: "Service change",
  GENERAL: "General",
};

export const CHURCH_SERVICE_ALERT_STATUSES = [
  "DRAFT",
  "PUBLISHED",
  "ARCHIVED",
] as const;

export type ChurchServiceAlertStatus =
  (typeof CHURCH_SERVICE_ALERT_STATUSES)[number];

export const CHURCH_SERVICE_ALERT_STATUS_LABELS: Record<
  ChurchServiceAlertStatus,
  string
> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

export type ChurchServiceAlertNavItem = {
  href: string;
  label: string;
};

export type ChurchServiceAlertStaffRow = {
  id: string;
  alertType: ChurchServiceAlertType;
  typeLabel: string;
  status: ChurchServiceAlertStatus;
  statusLabel: string;
  title: string;
  message: string;
  startsAtLocal: string;
  expiresAtLocal: string;
  startsAtLabel: string;
  expiresAtLabel: string;
  timingLabel: string;
  isPublic: boolean;
};

export type ChurchServiceAlertPublicView = {
  typeLabel: string;
  title: string;
  message: string;
  expiresAtLabel: string;
  updatedAtLabel: string;
};

const DATETIME_LOCAL_MINUTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const DATETIME_LOCAL_SECOND = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

export function churchServiceAlertNavItems(
  canManageAnnouncements: boolean,
): ChurchServiceAlertNavItem[] {
  return canManageAnnouncements
    ? [{ href: CHURCH_SERVICE_ALERTS_HREF, label: "Church Service Alerts" }]
    : [];
}

export function isChurchServiceAlertPublic(
  alert: {
    status: string;
    startsAt: Date;
    expiresAt: Date;
  },
  now = new Date(),
) {
  return (
    alert.status === "PUBLISHED" &&
    alert.startsAt.getTime() <= now.getTime() &&
    now.getTime() < alert.expiresAt.getTime()
  );
}

export function churchServiceAlertWindowsOverlap(
  left: { startsAt: Date; expiresAt: Date },
  right: { startsAt: Date; expiresAt: Date },
) {
  return (
    left.startsAt.getTime() < right.expiresAt.getTime() &&
    right.startsAt.getTime() < left.expiresAt.getTime()
  );
}

export function formatChurchServiceAlertDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(value);
}

export function toChurchServiceAlertDateTimeLocal(value: Date) {
  return value.toISOString().slice(0, 16);
}

function firstString(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

function optionalText(value: unknown) {
  const text = firstString(value).trim();
  return text || undefined;
}

const titleSchema = z
  .string()
  .trim()
  .min(CHURCH_SERVICE_ALERT_TITLE_MIN, {
    error: "Title must be 3–80 characters.",
  })
  .max(CHURCH_SERVICE_ALERT_TITLE_MAX, {
    error: "Title must be 3–80 characters.",
  })
  .refine((value) => !containsMarkup(value), {
    error: "Use plain text only. HTML and markup are not allowed.",
  });

const messageSchema = z
  .string()
  .trim()
  .min(CHURCH_SERVICE_ALERT_MESSAGE_MIN, {
    error: "Message must be 10–280 characters.",
  })
  .max(CHURCH_SERVICE_ALERT_MESSAGE_MAX, {
    error: "Message must be 10–280 characters.",
  })
  .refine((value) => !containsMarkup(value), {
    error: "Use plain text only. HTML and markup are not allowed.",
  });

function parseDateTime(value: unknown) {
  const raw = optionalText(value);
  if (!raw) return { success: false as const };
  let date: Date | null = null;
  if (DATETIME_LOCAL_MINUTE.test(raw)) {
    date = new Date(`${raw}:00.000Z`);
  } else if (DATETIME_LOCAL_SECOND.test(raw)) {
    date = new Date(`${raw}.000Z`);
  } else {
    date = new Date(raw);
  }
  if (!date || Number.isNaN(date.getTime())) return { success: false as const };
  return { success: true as const, date };
}

export function parseChurchServiceAlertContent(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const alertType = z.enum(CHURCH_SERVICE_ALERT_TYPES).safeParse(record.alertType);
  const title = titleSchema.safeParse(firstString(record.title));
  const message = messageSchema.safeParse(firstString(record.message));
  const startsAt = parseDateTime(record.startsAt);
  const expiresAt = parseDateTime(record.expiresAt);
  if (
    !alertType.success ||
    !title.success ||
    !message.success ||
    !startsAt.success ||
    !expiresAt.success
  ) {
    return { success: false as const };
  }
  if (expiresAt.date.getTime() <= startsAt.date.getTime()) {
    return { success: false as const };
  }
  return {
    success: true as const,
    data: {
      alertType: alertType.data,
      title: title.data,
      message: message.data,
      startsAt: startsAt.date,
      expiresAt: expiresAt.date,
    },
  };
}

export function parseChurchServiceAlertId(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const alertId = z.string().uuid().safeParse(
    optionalText(record.alertId) ?? firstString(input),
  );
  if (!alertId.success) return { success: false as const };
  return { success: true as const, data: alertId.data };
}

export function toChurchServiceAlertStaffRow(
  row: {
    id: string;
    alertType: ChurchServiceAlertType;
    status: ChurchServiceAlertStatus;
    title: string;
    message: string;
    startsAt: Date;
    expiresAt: Date;
  },
  now = new Date(),
): ChurchServiceAlertStaffRow {
  const isPublic = isChurchServiceAlertPublic(row, now);
  let timingLabel = `${formatChurchServiceAlertDateTime(row.startsAt)} – ${formatChurchServiceAlertDateTime(row.expiresAt)}`;
  if (row.status === "PUBLISHED" && row.startsAt.getTime() > now.getTime()) {
    timingLabel = `Scheduled · ${timingLabel}`;
  } else if (row.status === "PUBLISHED" && !isPublic) {
    timingLabel = `Expired · ${timingLabel}`;
  }
  return {
    id: row.id,
    alertType: row.alertType,
    typeLabel: CHURCH_SERVICE_ALERT_TYPE_LABELS[row.alertType],
    status: row.status,
    statusLabel: CHURCH_SERVICE_ALERT_STATUS_LABELS[row.status],
    title: row.title,
    message: row.message,
    startsAtLocal: toChurchServiceAlertDateTimeLocal(row.startsAt),
    expiresAtLocal: toChurchServiceAlertDateTimeLocal(row.expiresAt),
    startsAtLabel: formatChurchServiceAlertDateTime(row.startsAt),
    expiresAtLabel: formatChurchServiceAlertDateTime(row.expiresAt),
    timingLabel,
    isPublic,
  };
}

export function toChurchServiceAlertPublicView(row: {
  alertType: ChurchServiceAlertType;
  title: string;
  message: string;
  expiresAt: Date;
  updatedAt: Date;
}): ChurchServiceAlertPublicView {
  return {
    typeLabel: CHURCH_SERVICE_ALERT_TYPE_LABELS[row.alertType],
    title: row.title,
    message: row.message,
    expiresAtLabel: `Expires ${formatChurchServiceAlertDateTime(row.expiresAt)}`,
    updatedAtLabel: `Updated ${formatChurchServiceAlertDateTime(row.updatedAt)}`,
  };
}

export function churchServiceAlertAuditChanges(input: {
  action: string;
  alertType: string;
  status: string;
  startsAt: Date;
  expiresAt: Date;
}) {
  return [
    { field: "action", oldValue: null, newValue: input.action },
    { field: "alertType", oldValue: null, newValue: input.alertType },
    { field: "status", oldValue: null, newValue: input.status },
    {
      field: "startsAt",
      oldValue: null,
      newValue: input.startsAt.toISOString(),
    },
    {
      field: "expiresAt",
      oldValue: null,
      newValue: input.expiresAt.toISOString(),
    },
  ];
}
