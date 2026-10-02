import Link from "next/link";
import { requireUser } from "@/server/auth/current-user";
import { hasPermission } from "@/server/auth/rbac";
import { listContacts } from "@/server/services/contacts";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SearchBar, Pagination } from "@/components/crm/list-controls";
import { deleteContactAction } from "./actions";
import { ImportForm } from "./import-form";

function fullName(first: string, last: string | null) {
  return [first, last].filter(Boolean).join(" ");
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const page = Number(sp.page ?? "1") || 1;
  const result = await listContacts(user, { search: sp.q, page });
  const canCreate = hasPermission(user.role, "crm:create");
  const canDelete = hasPermission(user.role, "crm:delete");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Contacts</h1>
          <p className="text-sm text-muted-foreground">{result.total} total</p>
        </div>
        {canCreate && (
          <Link href="/app/contacts/new">
            <Button>New contact</Button>
          </Link>
        )}
      </div>

      <SearchBar placeholder="Search by name or email..." />

      {canCreate && <ImportForm />}

      <div className="divide-y divide-border rounded-lg border border-border">
        {result.items.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground">No contacts found.</p>
        )}
        {result.items.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <Link
                href={`/app/contacts/${c.id}`}
                className="font-medium hover:underline"
              >
                {fullName(c.firstName, c.lastName)}
              </Link>
              <p className="truncate text-sm text-muted-foreground">
                {[c.title, c.companyName, c.email].filter(Boolean).join(" · ") ||
                  "—"}
                {" · "}
                {formatDate(c.createdAt)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link href={`/app/contacts/${c.id}`}>
                <Button variant="outline" size="sm">
                  Edit
                </Button>
              </Link>
              {canDelete && (
                <form action={deleteContactAction}>
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
