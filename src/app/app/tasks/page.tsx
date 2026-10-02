import Link from "next/link";
import { requireUser } from "@/server/auth/current-user";
import { hasPermission } from "@/server/auth/rbac";
import { listTasks, type TaskFilter } from "@/server/services/activities";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toggleTaskAction } from "../activities-actions";

const FILTERS: { key: TaskFilter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "overdue", label: "Overdue" },
  { key: "completed", label: "Completed" },
  { key: "all", label: "All" },
];

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const filter = (FILTERS.find((f) => f.key === sp.filter)?.key ??
    "open") as TaskFilter;
  const tasks = await listTasks(user, filter);
  const canEdit = hasPermission(user.role, "crm:update");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Tasks</h1>

      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <Link key={f.key} href={`/app/tasks?filter=${f.key}`}>
            <Button variant={f.key === filter ? "default" : "outline"} size="sm">
              {f.label}
            </Button>
          </Link>
        ))}
      </div>

      <div className="divide-y divide-border rounded-lg border border-border">
        {tasks.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground">No tasks here.</p>
        )}
        {tasks.map((t) => {
          const done = Boolean(t.completedAt);
          const overdue =
            !done && t.dueAt && t.dueAt.getTime() < Date.now();
          const link = t.contactId
            ? `/app/contacts/${t.contactId}`
            : t.dealId
              ? `/app/deals/${t.dealId}`
              : null;
          return (
            <div
              key={t.id}
              className="flex items-center justify-between gap-4 p-4"
            >
              <div className="min-w-0">
                <p className={done ? "font-medium line-through" : "font-medium"}>
                  {t.subject}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t.dueAt ? (
                    <span className={overdue ? "text-destructive" : ""}>
                      Due {formatDate(t.dueAt)}
                    </span>
                  ) : (
                    "No due date"
                  )}
                  {link && (
                    <>
                      {" · "}
                      <Link href={link} className="text-primary hover:underline">
                        View
                      </Link>
                    </>
                  )}
                </p>
              </div>
              {canEdit && (
                <form action={toggleTaskAction}>
                  <input type="hidden" name="id" value={t.id} />
                  <input
                    type="hidden"
                    name="complete"
                    value={done ? "false" : "true"}
                  />
                  <Button type="submit" variant="outline" size="sm">
                    {done ? "Reopen" : "Complete"}
                  </Button>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
