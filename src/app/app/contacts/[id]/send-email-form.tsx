"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  sendContactEmailAction,
  type SendEmailState,
} from "./email-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? "Sending..." : "Send email"}
    </Button>
  );
}

const initial: SendEmailState = {};

export function SendEmailForm({
  contactId,
  contactEmail,
}: {
  contactId: string;
  contactEmail: string | null;
}) {
  const [state, action] = useActionState(sendContactEmailAction, initial);
  const disabled = !contactEmail;

  return (
    <section className="rounded-lg border border-border p-4">
      <h2 className="text-lg font-semibold">Send email</h2>
      {disabled ? (
        <p className="mt-1 text-sm text-muted-foreground">
          Add an email address to this contact to send mail.
        </p>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">
          To: {contactEmail}
        </p>
      )}

      <form action={action} className="mt-3 space-y-3">
        <input type="hidden" name="contactId" value={contactId} />
        <div className="space-y-2">
          <Label htmlFor="subject">Subject</Label>
          <Input id="subject" name="subject" disabled={disabled} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="body">Message</Label>
          <textarea
            id="body"
            name="body"
            rows={5}
            disabled={disabled}
            required
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
            placeholder="Write your message..."
          />
        </div>
        {state.error && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}
        {state.success && (
          <p className="text-sm text-green-600">{state.success}</p>
        )}
        <SubmitButton disabled={disabled} />
      </form>
    </section>
  );
}
