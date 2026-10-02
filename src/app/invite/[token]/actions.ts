"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { acceptInvite, MemberError } from "@/server/services/members";
import { createSession } from "@/server/auth/auth";
import { setSessionCookie } from "@/server/auth/cookies";

const acceptSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(2, "Your name is too short").max(80),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export interface AcceptState {
  error?: string;
}

export async function acceptInviteAction(
  _prev: AcceptState,
  formData: FormData,
): Promise<AcceptState> {
  const parsed = acceptSchema.safeParse({
    token: formData.get("token"),
    name: formData.get("name"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const result = await acceptInvite(parsed.data);
    const session = await createSession(result.userId, result.tenantId);
    await setSessionCookie(session.token, session.expiresAt);
  } catch (err) {
    if (err instanceof MemberError) return { error: err.message };
    throw err;
  }
  redirect("/app");
}
