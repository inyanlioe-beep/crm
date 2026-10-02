"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { registerAction, type AuthFormState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Creating workspace..." : "Create workspace"}
    </Button>
  );
}

const initial: AuthFormState = {};

export default function RegisterPage() {
  const [state, action] = useActionState(registerAction, initial);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-bold">Create your workspace</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Start managing your sales in minutes.
      </p>

      <form action={action} className="mt-8 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="tenantName">Workspace name</Label>
          <Input id="tenantName" name="tenantName" placeholder="Acme Inc" required />
          {state.fieldErrors?.tenantName && (
            <p className="text-sm text-destructive">
              {state.fieldErrors.tenantName[0]}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="ownerName">Your name</Label>
          <Input id="ownerName" name="ownerName" placeholder="Jane Doe" required />
          {state.fieldErrors?.ownerName && (
            <p className="text-sm text-destructive">
              {state.fieldErrors.ownerName[0]}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="jane@acme.com"
            required
          />
          {state.fieldErrors?.email && (
            <p className="text-sm text-destructive">
              {state.fieldErrors.email[0]}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="At least 8 characters"
            required
          />
          {state.fieldErrors?.password && (
            <p className="text-sm text-destructive">
              {state.fieldErrors.password[0]}
            </p>
          )}
        </div>

        {state.error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.error}
          </p>
        )}

        <SubmitButton />
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
