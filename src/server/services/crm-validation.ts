import { z } from "zod";

const emptyToUndef = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

const tags = z
  .string()
  .optional()
  .transform((v) =>
    v
      ? v
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [],
  );

export const companyFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  domain: z.preprocess(emptyToUndef, z.string().max(200).optional()),
  industry: z.preprocess(emptyToUndef, z.string().max(120).optional()),
  tags,
});

export const contactFormSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(80),
  lastName: z.preprocess(emptyToUndef, z.string().max(80).optional()),
  email: z.preprocess(
    emptyToUndef,
    z.string().email("Enter a valid email").optional(),
  ),
  phone: z.preprocess(emptyToUndef, z.string().max(40).optional()),
  title: z.preprocess(emptyToUndef, z.string().max(120).optional()),
  companyId: z.preprocess(
    emptyToUndef,
    z.string().uuid().optional(),
  ),
  tags,
});

export type CompanyFormValues = z.infer<typeof companyFormSchema>;
export type ContactFormValues = z.infer<typeof contactFormSchema>;
