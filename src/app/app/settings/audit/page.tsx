import { requireUser } from "@/server/auth/current-user";
import { requirePermission } from "@/server/auth/rbac";
import { listAuditLogs } from "@/server/services/audit";
import { formatDate } from "@/lib/utils";

export default async function AuditPage() {
  const user = await requireUser();
  requirePermission(user.role, "members:view");
  const logs = await listAuditLogs(user);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit log</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Recent sensitive actions in this workspace.
        </p>
      </div>

      <div className="divide-y divide-border rounded-lg border border-border">
        {logs.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground">
            No audit entries yet.
          </p>
        )}
        {logs.map((l) => (
          <div key={l.id} className="flex items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <p className="font-medium">{l.action}</p>
              <p className="truncate text-sm text-muted-foreground">
                {[l.entity, l.entityId].filter(Boolean).join(" · ") || "—"}
              </p>
            </div>
            <div className="shrink-0 text-right text-sm text-muted-foreground">
              <p>{l.actorName ?? "System"}</p>
              <p>{formatDate(l.createdAt)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
