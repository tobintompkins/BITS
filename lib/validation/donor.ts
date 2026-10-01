import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).transform(v => v || null);
export const donorSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(100),
  lastName: z.string().trim().min(1, "Last name is required.").max(100),
  email: z.union([z.literal(""), z.email()]).transform(v => v.toLowerCase() || null),
  phone: optionalText(50),
  mailingAddressLine1: optionalText(200), mailingAddressLine2: optionalText(200),
  city: optionalText(100), state: optionalText(100), postalCode: optionalText(30), country: optionalText(100),
  preferredCommunicationMethod: optionalText(100), internalNotes: optionalText(4000),
  active: z.boolean(), deceased: z.boolean(),
  deceasedDate: z.union([z.literal(""), z.iso.date()]).transform(v => v ? new Date(`${v}T00:00:00Z`) : null),
}).refine(v => v.deceased || !v.deceasedDate, { message: "Select deceased before adding a date.", path: ["deceasedDate"] });
export type DonorFormValues = z.input<typeof donorSchema>;
export type DonorActionState = { message: string; savedId?: string };
export const emptyDonor: DonorFormValues = {
  firstName: "", lastName: "", email: "", phone: "", mailingAddressLine1: "", mailingAddressLine2: "",
  city: "", state: "", postalCode: "", country: "", preferredCommunicationMethod: "", internalNotes: "",
  active: true, deceased: false, deceasedDate: "",
};
