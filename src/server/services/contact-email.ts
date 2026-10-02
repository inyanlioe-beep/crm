import { requirePermission } from "@/server/auth/rbac";
import type { SessionUser } from "@/server/auth/auth";
import { getContact } from "@/server/services/contacts";
import { addEmailActivity } from "@/server/services/activities";
import { sendEmail } from "@/server/email/email";
import { buildContactEmail } from "@/server/email/templates";

export class EmailError extends Error {}

export interface SendContactEmailInput {
  contactId: string;
  subject: string;
  body: string;
}

export interface SendContactEmailResult {
  messageId: string | null;
  activityId: string;
}

/**
 * Send a transactional email to a contact and log it on the contact's
 * timeline. The timeline record is written only after the send succeeds, so a
 * failed send does not leave a misleading "sent" entry.
 */
export async function sendContactEmail(
  user: SessionUser,
  input: SendContactEmailInput,
): Promise<SendContactEmailResult> {
  requirePermission(user.role, "crm:create");

  const contact = await getContact(user, input.contactId);
  if (!contact) throw new EmailError("Contact not found");
  if (!contact.email) {
    throw new EmailError("This contact has no email address");
  }

  const template = buildContactEmail({
    subject: input.subject,
    body: input.body,
  });

  const { id: messageId } = await sendEmail({
    to: contact.email,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });

  const { id: activityId } = await addEmailActivity(user, {
    contactId: input.contactId,
    subject: `Email: ${input.subject}`,
    body: input.body,
  });

  return { messageId, activityId };
}
