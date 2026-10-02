import { requireUser } from "@/server/auth/current-user";
import { requirePermission } from "@/server/auth/rbac";
import { CompanyForm } from "../company-form";
import { createCompanyAction } from "../actions";

export default async function NewCompanyPage() {
  const user = await requireUser();
  requirePermission(user.role, "crm:create");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">New company</h1>
      <CompanyForm action={createCompanyAction} submitLabel="Create company" />
    </div>
  );
}
