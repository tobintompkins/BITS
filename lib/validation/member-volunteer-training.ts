export const MEMBER_VOLUNTEER_TRAINING_NOTICE =
  "See your recorded training and anything due for renewal. This page is read-only and does not include certificates, documents, or background-check information.";

export const MEMBER_VOLUNTEER_TRAINING_EMPTY_COPY =
  "No training has been recorded on your connected church membership. This page does not mark a course complete.";

export const MEMBER_VOLUNTEER_TRAINING_PENDING_COPY =
  "Your sign-in is not connected to a church membership record, so training cannot be shown. Ask the church office to connect that record. A matching name or email is not used, and this page does not add training.";

export const MEMBER_VOLUNTEER_TRAINING_ROW_FIELDS = [
  "title",
  "ministryName",
  "completedOnLabel",
  "expiresOnLabel",
  "status",
  "statusLabel",
] as const;

export const memberVolunteerTrainingHref = "/portal/training";
