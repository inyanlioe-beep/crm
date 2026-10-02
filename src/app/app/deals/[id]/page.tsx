import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/current-user";
import { hasPermission } from "@/server/auth/rbac";
import { getDeal, listStages } from "@/server/services/deals";
import { companyOptions } from "@/server/services/companies";
import { contactOptions } from "@/server/services/contacts";
import { listTimeline } from "@/server/services/activities";
import { Timeline } from "@/components/crm/timeline";
import { DealForm } from "../deal-form";
import { updateDealAction, deleteDealAction } from "../actions";
import { Button } from "@/components/ui/button";

function toDateInput(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

export default async function EditDealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const [deal, stages, companies, contacts, timeline] = await Promise.all([
    getDeal(user, id),
    listStages(user),
    companyOptions(user),
    contactOptions(user),
    listTimeline(user, { dealId: id }),
  ]);
  if (!deal) notFound();

  const action = updateDealAction.bind(null, id);
  const canEdit = hasPermission(user.role, "crm:create");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Edit deal</h1>
        <form action={deleteDealAction}>
          <input type="hidden" name="id" value={deal.id} />
          <Button variant="destructive" type="submit">
            Delete
          </Button>
        </form>
      </div>
      <DealForm
        action={action}
        stages={stages}
        companies={companies}
        contacts={contacts}
        submitLabel="Save changes"
        defaults={{
          title: deal.title,
          value: deal.valueCents / 100,
          currency: deal.currency,
          stageId: deal.stageId,
          contactId: deal.contactId,
          companyId: deal.companyId,
          expectedCloseDate: toDateInput(deal.expectedCloseDate),
        }}
      />

      <Timeline items={timeline} dealId={id} canEdit={canEdit} />
    </div>
  );
}
