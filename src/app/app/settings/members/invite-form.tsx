"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { inviteMemberAction, type MemberActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Sending..." : "Send invite"}
    </Button>
  );
}

const initial: MemberActionState = {};

export function InviteForm() {
  const [state, action] = useActionState(inviteMemberAction, initial);

  return (
    <section className="rounded-lg border border-border p-4">
      <h2 className="text-lg font-semibold">Invite a teammate</h2>
      <form action={action} className="mt-3 flex flex-wrap items-end gap-3">
        <div className="flex-1 space-y-2" style={{ minWidth: 220 }}>
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            name="email"
            type="email"
            placeholder="teammate@acme.com"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="invite-role">Role</Label>
          <select
            id="invite-role"
            name="role"
            defaultValue="sales"
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="admin">Admin</option>
            <option value="sales">Sales</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
        <SubmitButton />
      </form>
      {state.error && (
        <p className="mt-3 text-sm text-destructive">{state.error}</p>
      )}
      {state.success && (
        <p className="mt-3 text-sm text-green-600">{state.success}</p>
      )}
    </section>
  );
}
