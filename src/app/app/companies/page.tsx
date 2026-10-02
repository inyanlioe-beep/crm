import Link from "next/link";
import { requireUser } from "@/server/auth/current-user";
import { hasPermission } from "@/server/auth/rbac";
import { listCompanies } from "@/server/services/companies";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SearchBar, Pagination } from "@/components/crm/list-controls";
import { deleteCompanyAction } from "./actions";

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const page = Number(sp.page ?? "1") || 1;
  const result = await listCompanies(user, { search: sp.q, page });
  const canCreate = hasPermission(user.role, "crm:create");
  const canDelete = hasPermission(user.role, "crm:delete");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Companies</h1>
          <p className="text-sm text-muted-foreground">
            {result.total} total
          </p>
        </div>
        {canCreate && (
          <Link href="/app/companies/new">
            <Button>New company</Button>
          </Link>
        )}
      </div>

      <SearchBar placeholder="Search companies..." />

      <div className="divide-y divide-border rounded-lg border border-border">
        {result.items.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground">
            No companies found.
          </p>
        )}
        {result.items.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <Link
                href={`/app/companies/${c.id}`}
                className="font-medium hover:underline"
              >
                {c.name}
              </Link>
              <p className="truncate text-sm text-muted-foreground">
                {[c.industry, c.domain].filter(Boolean).join(" · ") || "—"}
                {" · "}
                {c.contactCount} contacts · {formatDate(c.createdAt)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link href={`/app/companies/${c.id}`}>
                <Button variant="outline" size="sm">
                  Edit
                </Button>
              </Link>
              {canDelete && (
                <form action={deleteCompanyAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <Button variant="destructive" size="sm" type="submit">
                    Delete
                  </Button>
                </form>
              )}
            </div>
          </div>
        ))}
      </div>

      <Pagination page={result.page} pageCount={result.pageCount} />
    </div>
  );
}
