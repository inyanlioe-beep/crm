import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/current-user";
import { getCompany } from "@/server/services/companies";
import { CompanyForm } from "../company-form";
import { updateCompanyAction } from "../actions";

export default async function EditCompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const company = await getCompany(user, id);
  if (!company) notFound();

  // Bind the id into the server action (keeps it a true server action).
  const action = updateCompanyAction.bind(null, id);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Edit company</h1>
      <CompanyForm
        action={action}
        submitLabel="Save changes"
        defaults={{
          name: company.name,
          domain: company.domain,
          industry: company.industry,
          tags: company.tags,
        }}
      />
    </div>
  );
}
