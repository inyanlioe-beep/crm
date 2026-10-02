"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { importContactsAction, type ImportState } from "./actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" disabled={pending}>
      {pending ? "Importing..." : "Import CSV"}
    </Button>
  );
}

const initial: ImportState = {};

export function ImportForm() {
  const [state, action] = useActionState(importContactsAction, initial);

  return (
    <div className="rounded-lg border border-border p-4">
      <h2 className="font-semibold">Import contacts</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Upload a CSV with a first name column. Optional: last name, email,
        phone, title, company.
      </p>
      <form action={action} className="mt-3 flex items-end gap-3">
        <div className="space-y-2">
          <Label htmlFor="file">CSV file</Label>
          <input
            id="file"
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            className="block text-sm"
          />
        </div>
        <SubmitButton />
      </form>
      {state.error && (
        <p className="mt-3 text-sm text-destructive">{state.error}</p>
      )}
      {state.result && (
        <div className="mt-3 text-sm">
          <p className="text-green-600">
            Imported {state.result.imported} contact
            {state.result.imported === 1 ? "" : "s"}.
          </p>
          {state.result.errors.length > 0 && (
            <ul className="mt-1 list-inside list-disc text-muted-foreground">
              {state.result.errors.slice(0, 5).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
