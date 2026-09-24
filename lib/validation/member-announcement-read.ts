import { z } from "zod";

export const markMemberAnnouncementReadSchema = z.object({
  announcementId: z.string().uuid(),
});
