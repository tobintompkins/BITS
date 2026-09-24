import { z } from "zod";

export const MEMBER_EVENT_REGISTRATIONS_PAGE_SIZE = 25;

export const memberEventRegistrationViewValues = ["upcoming", "past"] as const;
export type MemberEventRegistrationView =
  (typeof memberEventRegistrationViewValues)[number];

export const memberEventRegistrationStatusFilterValues = [
  "all",
  "pending",
  "confirmed",
  "waitlisted",
  "cancelled",
] as const;

export const memberEventRegistrationNoticeValues = [
  "cancelled",
  "not-found",
  "no-organization",
  "disabled",
  "deadline",
  "invalid-reason",
  "unavailable",
] as const;
export type MemberEventRegistrationNotice =
  (typeof memberEventRegistrationNoticeValues)[number];
export type MemberEventRegistrationStatusFilter =
  (typeof memberEventRegistrationStatusFilterValues)[number];

export const memberEventRegistrationStatusFilterMap = {
  all: null,
  pending: "PENDING",
  confirmed: "CONFIRMED",
  waitlisted: "WAITLISTED",
  cancelled: "CANCELLED",
} as const;

const registrationStatusLabels: Record<string, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  WAITLISTED: "Waitlisted",
  OFFERED: "Offered",
  CANCELLED: "Cancelled",
  DECLINED: "Declined",
  EXPIRED: "Expired",
  CHECKED_IN: "Checked in",
  NO_SHOW: "No show",
};

function scalar(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseMemberEventRegistrationsQuery(
  input: Record<string, string | string[] | undefined>,
) {
  const viewRaw = (scalar(input.view) ?? "upcoming").trim().toLowerCase();
  const viewParse = z
    .enum(memberEventRegistrationViewValues)
    .safeParse(viewRaw);
  const statusRaw = (scalar(input.status) ?? "all").trim().toLowerCase();
  const statusParse = z
    .enum(memberEventRegistrationStatusFilterValues)
    .safeParse(statusRaw);
  const pageParse = z.coerce
    .number()
    .int()
    .min(1)
    .safeParse(scalar(input.page) ?? 1);

  return {
    view: viewParse.success ? viewParse.data : "upcoming",
    status: statusParse.success ? statusParse.data : "all",
    page: pageParse.success ? pageParse.data : 1,
    pageSize: MEMBER_EVENT_REGISTRATIONS_PAGE_SIZE,
  };
}

export function memberEventRegistrationsSearchParams(query: {
  view?: MemberEventRegistrationView;
  status?: MemberEventRegistrationStatusFilter;
  page?: number;
  notice?: MemberEventRegistrationNotice;
}) {
  const params = new URLSearchParams();
  if (query.view && query.view !== "upcoming") params.set("view", query.view);
  if (query.status && query.status !== "all") params.set("status", query.status);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  if (query.notice) params.set("notice", query.notice);
  return params;
}

export function memberEventRegistrationsHref(query: {
  view?: MemberEventRegistrationView;
  status?: MemberEventRegistrationStatusFilter;
  page?: number;
  notice?: MemberEventRegistrationNotice;
}) {
  const text = memberEventRegistrationsSearchParams(query).toString();
  return text ? `/portal/events?${text}` : "/portal/events";
}

export function formatMemberRegistrationStatus(status: string) {
  return registrationStatusLabels[status] ?? status;
}

export function parseMemberEventNotice(
  value: string | string[] | undefined,
): MemberEventRegistrationNotice | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = z.enum(memberEventRegistrationNoticeValues).safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export const memberEventNoticeMessages: Record<
  MemberEventRegistrationNotice,
  { tone: "success" | "error"; message: string }
> = {
  cancelled: {
    tone: "success",
    message: "Your registration has been cancelled.",
  },
  "not-found": {
    tone: "error",
    message: "That registration could not be found.",
  },
  "no-organization": {
    tone: "error",
    message: "The church organization has not been configured.",
  },
  disabled: {
    tone: "error",
    message: "Cancellation is not allowed for this event.",
  },
  deadline: {
    tone: "error",
    message: "The cancellation deadline for this event has passed.",
  },
  "invalid-reason": {
    tone: "error",
    message: "Please enter a plain-text reason of 500 characters or fewer.",
  },
  unavailable: {
    tone: "error",
    message: "Unable to cancel this registration right now.",
  },
};
