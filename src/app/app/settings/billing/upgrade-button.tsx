"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { startCheckoutAction, type BillingActionState } from "./actions";
import { Button } from "@/components/ui/button";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Redirecting..." : "Upgrade to Pro"}
    </Button>
  );
}

const initial: BillingActionState = {};

export function UpgradeButton() {
  const [state, action] = useActionState(startCheckoutAction, initial);
  return (
    <form action={action}>
      <SubmitButton />
      {state.error && (
        <p className="mt-2 text-sm text-destructive">{state.error}</p>
      )}
    </form>
  );
}
