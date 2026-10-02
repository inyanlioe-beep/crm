import { requireUser } from "@/server/auth/current-user";
import { requirePermission } from "@/server/auth/rbac";
import { listStages } from "@/server/services/deals";
import { companyOptions } from "@/server/services/companies";
import { contactOptions } from "@/server/services/contacts";
import { DealForm } from "../deal-form";
import { createDealAction } from "../actions";

export default async function NewDealPage() {
  const user = await requireUser();
  requirePermission(user.role, "crm:create");
  const [stages, companies, contacts] = await Promise.all([
    listStages(user),
    companyOptions(user),
    contactOptions(user),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">New deal</h1>
      <DealForm
        action={createDealAction}
        stages={stages}
        companies={companies}
        contacts={contacts}
        submitLabel="Create deal"
      />
    </div>
  );
}
