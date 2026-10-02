import { requireUser } from "@/server/auth/current-user";
import { hasPermission } from "@/server/auth/rbac";
import {
  listMembers,
  listPendingInvites,
} from "@/server/services/members";
import { formatDate } from "@/lib/utils";
import { InviteForm } from "./invite-form";
import {
  revokeInviteAction,
  updateRoleAction,
  removeMemberAction,
} from "./actions";
import { Button } from "@/components/ui/button";

export default async function MembersPage() {
  const user = await requireUser();
  const canManage = hasPermission(user.role, "members:invite");

  const [members, invites] = await Promise.all([
    listMembers(user.tenantId),
    canManage ? listPendingInvites(user.tenantId) : Promise.resolve([]),
  ]);

  return (
    <div className="max-w-3xl space-y-10">
      <div>
        <h1 className="text-2xl font-bold">Team members</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage who has access to this workspace.
        </p>
      </div>

      {canManage && <InviteForm />}

      <section>
        <h2 className="text-lg font-semibold">Members ({members.length})</h2>
        <div className="mt-3 divide-y divide-border rounded-lg border border-border">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between gap-4 p-4"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{m.name}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {m.email}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {canManage && m.role !== "owner" && m.id !== user.userId ? (
                  <form action={updateRoleAction} className="flex items-center">
                    <input type="hidden" name="userId" value={m.id} />
                    <select
                      name="role"
                      defaultValue={m.role}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                      aria-label={`Role for ${m.name}`}
                    >
                      <option value="admin">admin</option>
                      <option value="sales">sales</option>
                      <option value="viewer">viewer</option>
                    </select>
                    <Button type="submit" size="sm" variant="outline" className="ml-2">
                      Update
                    </Button>
                  </form>
                ) : (
                  <span className="rounded bg-secondary px-2 py-1 text-xs">
                    {m.role}
                  </span>
                )}
                {canManage && m.role !== "owner" && m.id !== user.userId && (
                  <form action={removeMemberAction}>
                    <input type="hidden" name="userId" value={m.id} />
                    <Button type="submit" size="sm" variant="destructive">
                      Remove
                    </Button>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {canManage && invites.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold">
            Pending invitations ({invites.length})
          </h2>
          <div className="mt-3 divide-y divide-border rounded-lg border border-border">
            {invites.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between gap-4 p-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{inv.email}</p>
                  <p className="text-sm text-muted-foreground">
                    {inv.role} · expires {formatDate(inv.expiresAt)}
                  </p>
                </div>
                <form action={revokeInviteAction}>
                  <input type="hidden" name="inviteId" value={inv.id} />
                  <Button type="submit" size="sm" variant="outline">
                    Revoke
                  </Button>
                </form>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
