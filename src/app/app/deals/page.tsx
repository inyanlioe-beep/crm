import Link from "next/link";
import { requireUser } from "@/server/auth/current-user";
import { hasPermission } from "@/server/auth/rbac";
import { getBoard } from "@/server/services/deals";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { KanbanBoard } from "./kanban-board";

export default async function DealsPage() {
  const user = await requireUser();
  const board = await getBoard(user);
  const canCreate = hasPermission(user.role, "crm:create");
  const canEdit = hasPermission(user.role, "crm:update");

  if (!board) {
    return (
      <div>
        <h1 className="text-2xl font-bold">Deals</h1>
        <p className="mt-2 text-muted-foreground">No pipeline configured.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{board.pipelineName}</h1>
          <p className="text-sm text-muted-foreground">
            Total {formatCurrency(board.totalCents)} · Weighted forecast{" "}
            {formatCurrency(board.weightedCents)}
          </p>
        </div>
        {canCreate && (
          <Link href="/app/deals/new">
            <Button>New deal</Button>
          </Link>
        )}
      </div>

      <KanbanBoard board={board} canEdit={canEdit} />
    </div>
  );
}
