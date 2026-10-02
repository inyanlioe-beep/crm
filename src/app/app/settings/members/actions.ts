"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth/current-user";
import { ForbiddenError } from "@/server/auth/rbac";
import {
  inviteMember,
  revokeInvite,
  updateMemberRole,
  removeMember,
  MemberError,
} from "@/server/services/members";
import { QuotaError } from "@/server/services/subscription";

const ROLES = ["admin", "sales", "viewer"] as const;

const inviteSchema = z.object({
  email: z.string().email("Enter a valid email"),
  role: z.enum(ROLES),
});

const roleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(ROLES),
});

export interface MemberActionState {
  error?: string;
  success?: string;
}

function toMessage(err: unknown): string {
  if (
    err instanceof ForbiddenError ||
    err instanceof MemberError ||
    err instanceof QuotaError
  ) {
    return err.message;
  }
  throw err;
}

export async function inviteMemberAction(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const user = await requireUser();
  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    await inviteMember(user, parsed.data);
  } catch (err) {
    return { error: toMessage(err) };
  }
  revalidatePath("/app/settings/members");
  return { success: `Invitation sent to ${parsed.data.email}` };
}

export async function revokeInviteAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("inviteId"));
  try {
    await revokeInvite(user, id);
  } catch (err) {
    toMessage(err);
  }
  revalidatePath("/app/settings/members");
}

export async function updateRoleAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = roleSchema.safeParse({
    userId: formData.get("userId"),
    role: formData.get("role"),
  });
  if (!parsed.success) return;
  try {
    await updateMemberRole(user, parsed.data);
  } catch (err) {
    toMessage(err);
  }
  revalidatePath("/app/settings/members");
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const userId = String(formData.get("userId"));
  try {
    await removeMember(user, userId);
  } catch (err) {
    toMessage(err);
  }
  revalidatePath("/app/settings/members");
}
