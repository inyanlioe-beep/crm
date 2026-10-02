import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/current-user";
import { hasPermission } from "@/server/auth/rbac";
import { getContact } from "@/server/services/contacts";
import { companyOptions } from "@/server/services/companies";
import { listTimeline } from "@/server/services/activities";
import { Timeline } from "@/components/crm/timeline";
import { ContactForm } from "../contact-form";
import { updateContactAction } from "../actions";
import { SendEmailForm } from "./send-email-form";

export default async function EditContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const [contact, companies, timeline] = await Promise.all([
    getContact(user, id),
    companyOptions(user),
    listTimeline(user, { contactId: id }),
  ]);
  if (!contact) notFound();

  const action = updateContactAction.bind(null, id);
  const canEdit = hasPermission(user.role, "crm:create");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Edit contact</h1>
      <ContactForm
        action={action}
        companies={companies}
        submitLabel="Save changes"
        defaults={{
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          phone: contact.phone,
          title: contact.title,
          companyId: contact.companyId,
          tags: contact.tags,
        }}
      />

      {canEdit && (
        <SendEmailForm contactId={id} contactEmail={contact.email} />
      )}

      <Timeline items={timeline} contactId={id} canEdit={canEdit} />
    </div>
  );
}
