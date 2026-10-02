import Link from "next/link";
import { getInviteByToken } from "@/server/services/members";
import { AcceptInviteForm } from "./accept-form";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await getInviteByToken(token);

  if (!invite) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 text-center">
        <h1 className="text-2xl font-bold">Invitation unavailable</h1>
        <p className="mt-2 text-muted-foreground">
          This invitation is invalid, has already been used, or has expired.
        </p>
        <Link href="/login" className="mt-6 font-medium text-primary underline">
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-bold">Join the workspace</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        You were invited as <span className="font-medium">{invite.role}</span>.
        Set up your account for <span className="font-medium">{invite.email}</span>.
      </p>
      <AcceptInviteForm token={token} />
    </div>
  );
}
