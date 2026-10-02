"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth/current-user";
import { ForbiddenError } from "@/server/auth/rbac";
import {
  addNote,
  addTask,
  setTaskComplete,
  deleteActivity,
} from "@/server/services/activities";

const emptyToUndef = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

const target = z.object({
  contactId: z.preprocess(emptyToUndef, z.string().uuid().optional()),
  dealId: z.preprocess(emptyToUndef, z.string().uuid().optional()),
});

const noteSchema = target.extend({
  body: z.string().min(1, "Note cannot be empty").max(5000),
});

const taskSchema = target.extend({
  subject: z.string().min(1, "Task needs a title").max(200),
  dueAt: z.preprocess(emptyToUndef, z.string().optional()),
});

export interface ActivityState {
  error?: string;
}

/** Where to revalidate after mutating an activity. */
function revalidateFor(contactId?: string, dealId?: string) {
  revalidatePath("/app/tasks");
  if (contactId) revalidatePath(`/app/contacts/${contactId}`);
  if (dealId) revalidatePath(`/app/deals/${dealId}`);
}

export async function addNoteAction(
  _prev: ActivityState,
  formData: FormData,
): Promise<ActivityState> {
  const user = await requireUser();
  const parsed = noteSchema.safeParse({
    body: formData.get("body"),
    contactId: formData.get("contactId"),
    dealId: formData.get("dealId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid note" };
  }
  try {
    await addNote(user, parsed.data);
  } catch (err) {
    if (err instanceof ForbiddenError) return { error: err.message };
    throw err;
  }
  revalidateFor(parsed.data.contactId, parsed.data.dealId);
  return {};
}

export async function addTaskAction(
  _prev: ActivityState,
  formData: FormData,
): Promise<ActivityState> {
  const user = await requireUser();
  const parsed = taskSchema.safeParse({
    subject: formData.get("subject"),
    dueAt: formData.get("dueAt"),
    contactId: formData.get("contactId"),
    dealId: formData.get("dealId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid task" };
  }
  try {
    await addTask(user, {
      subject: parsed.data.subject,
      contactId: parsed.data.contactId,
      dealId: parsed.data.dealId,
      dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
    });
  } catch (err) {
    if (err instanceof ForbiddenError) return { error: err.message };
    throw err;
  }
  revalidateFor(parsed.data.contactId, parsed.data.dealId);
  return {};
}

export async function toggleTaskAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const complete = formData.get("complete") === "true";
  const contactId = formData.get("contactId")?.toString() || undefined;
  const dealId = formData.get("dealId")?.toString() || undefined;
  try {
    await setTaskComplete(user, id, complete);
  } catch (err) {
    if (!(err instanceof ForbiddenError)) throw err;
  }
  revalidateFor(contactId, dealId);
}

export async function deleteActivityAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const contactId = formData.get("contactId")?.toString() || undefined;
  const dealId = formData.get("dealId")?.toString() || undefined;
  try {
    await deleteActivity(user, id);
  } catch (err) {
    if (!(err instanceof ForbiddenError)) throw err;
  }
  revalidateFor(contactId, dealId);
}
