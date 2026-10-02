import Link from "next/link";
import { requireUser } from "@/server/auth/current-user";
import { hasPermission } from "@/server/auth/rbac";

export default async function SettingsPage() {
  const user = await requireUser();
  const canManageMembers = hasPermission(user.role, "members:view");
  const canManageBilling = hasPermission(user.role, "billing:manage");

  const links = [
    {
      href: "/app/settings/members",
      title: "Team members",
      desc: "Invite teammates and manage roles.",
      show: canManageMembers,
    },
    {
      href: "/app/settings/billing",
      title: "Billing",
      desc: "View your plan and usage.",
      show: true,
    },
    {
      href: "/app/settings/audit",
      title: "Audit log",
      desc: "Review sensitive actions in your workspace.",
      show: canManageMembers,
    },
  ].filter((l) => l.show || l.href.endsWith("billing"));

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-lg border border-border p-4 hover:bg-accent"
          >
            <h2 className="font-semibold">{l.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{l.desc}</p>
          </Link>
        ))}
      </div>
      {!canManageBilling && (
        <p className="text-sm text-muted-foreground">
          Some settings are only available to the workspace owner.
        </p>
      )}
    </div>
  );
}
