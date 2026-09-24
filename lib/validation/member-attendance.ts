import { z } from "zod";

export const MEMBER_ATTENDANCE_PAGE_SIZE = 50;

export const MEMBER_ATTENDANCE_EMPTY_COPY =
  "You do not have any attendance records yet. Contact the church office if you believe this is incorrect.";

function scalar(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseMemberAttendanceQuery(
  input: Record<string, string | string[] | undefined>,
) {
  const pageParse = z.coerce
    .number()
    .int()
    .min(1)
    .safeParse(scalar(input.page) ?? 1);

  return {
    page: pageParse.success ? pageParse.data : 1,
    pageSize: MEMBER_ATTENDANCE_PAGE_SIZE,
  };
}

export function memberAttendanceHref(page = 1) {
  return page > 1 ? `/portal/attendance?page=${page}` : "/portal/attendance";
}
