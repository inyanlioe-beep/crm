"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth/current-user";
import { ForbiddenError } from "@/server/auth/rbac";
import {
  sendContactEmail,
  EmailError,
} from "@/server/services/contact-email";

const schema = z.object({
  contactId: z.string().uuid(),
  subject: z.string().min(1, "Subject is required").max(200),
  body: z.string().min(1, "Message is required").max(10000),
});

export interface SendEmailState {
  error?: string;
  success?: string;
}

export async function sendContactEmailAction(
  _prev: SendEmailState,
  formData: FormData,
): Promise<SendEmailState> {
  const user = await requireUser();
  const parsed = schema.safeParse({
    contactId: formData.get("contactId"),
    subject: formData.get("subject"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await sendContactEmail(user, parsed.data);
  } catch (err) {
    if (err instanceof ForbiddenError || err instanceof EmailError) {
      return { error: err.message };
    }
    return { error: "Failed to send email. Please try again." };
  }

  revalidatePath(`/app/contacts/${parsed.data.contactId}`);
  return { success: "Email sent and logged to the timeline." };
}
