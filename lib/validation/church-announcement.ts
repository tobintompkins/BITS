import { z } from "zod";

const MARKUP_PATTERN = /<\/?[a-zA-Z][^>]*>/;

export function containsMarkup(value: string) {
  return MARKUP_PATTERN.test(value);
}

const plainText = (min: number, max: number, lengthMessage: string) =>
  z
    .string()
    .trim()
    .min(min, { error: lengthMessage })
    .max(max, { error: lengthMessage })
    .refine((value) => !containsMarkup(value), {
      error: "Use plain text only. HTML and markup are not allowed.",
    });

export const churchAnnouncementContentSchema = z.object({
  title: plainText(3, 140, "Title must be 3–140 characters."),
  body: plainText(10, 5000, "Announcement text must be 10–5000 characters."),
});

export const churchAnnouncementIdSchema = z.string().uuid({
  error: "Announcement was not found.",
});

export type ChurchAnnouncementContentInput = z.infer<
  typeof churchAnnouncementContentSchema
>;
