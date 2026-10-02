import Link from "next/link";
import { requireUser } from "@/server/auth/current-user";
import { logoutAction } from "../(auth)/actions";
import { Button } from "@/components/ui/button";

const nav = [
  { href: "/app", label: "Dashboard" },
  { href: "/app/contacts", label: "Contacts" },
  { href: "/app/companies", label: "Companies" },
  { href: "/app/deals", label: "Deals" },
  { href: "/app/tasks", label: "Tasks" },
  { href: "/app/settings", label: "Settings" },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-r border-border bg-card p-4 sm:block">
        <div className="px-2 text-lg font-bold">CRM</div>
        <nav className="mt-6 space-y-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border px-6 py-3">
          <div className="text-sm text-muted-foreground">
            Signed in as{" "}
            <span className="font-medium text-foreground">{user.email}</span>
            <span className="ml-2 rounded bg-secondary px-2 py-0.5 text-xs">
              {user.role}
            </span>
          </div>
          <form action={logoutAction}>
            <Button variant="outline" size="sm" type="submit">
              Sign out
            </Button>
          </form>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
