export const MEMBER_VOLUNTEER_TRAINING_NOTICE =
  "These are the ordinary ministry training records connected to your membership. This page is read-only and does not include certificates, documents, or background-check information.";

export const MEMBER_VOLUNTEER_TRAINING_EMPTY_COPY =
  "No ministry training has been recorded for you yet. Contact the church office if this information needs correction.";

export const MEMBER_VOLUNTEER_TRAINING_PENDING_COPY =
  "Your account must be connected to your church membership record before training can appear. Contact the church office if this information needs correction.";

export const MEMBER_VOLUNTEER_TRAINING_ROW_FIELDS = [
  "title",
  "ministryName",
  "completedOnLabel",
  "expiresOnLabel",
  "status",
  "statusLabel",
] as const;

export const memberVolunteerTrainingHref = "/portal/training";
