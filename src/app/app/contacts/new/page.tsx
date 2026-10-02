import { requireUser } from "@/server/auth/current-user";
import { requirePermission } from "@/server/auth/rbac";
import { companyOptions } from "@/server/services/companies";
import { ContactForm } from "../contact-form";
import { createContactAction } from "../actions";

export default async function NewContactPage() {
  const user = await requireUser();
  requirePermission(user.role, "crm:create");
  const companies = await companyOptions(user);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">New contact</h1>
      <ContactForm
        action={createContactAction}
        companies={companies}
        submitLabel="Create contact"
      />
    </div>
  );
}
