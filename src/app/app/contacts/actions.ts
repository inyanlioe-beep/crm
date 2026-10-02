"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/current-user";
import { ForbiddenError } from "@/server/auth/rbac";
import {
  createContact,
  updateContact,
  deleteContact,
  importContactsCsv,
  type ImportResult,
} from "@/server/services/contacts";
import { QuotaError } from "@/server/services/subscription";
import { contactFormSchema } from "@/server/services/crm-validation";

export interface ContactFormState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

function parse(formData: FormData) {
  return contactFormSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    title: formData.get("title"),
    companyId: formData.get("companyId"),
    tags: formData.get("tags"),
  });
}

export async function createContactAction(
  _prev: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const user = await requireUser();
  const parsed = parse(formData);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    await createContact(user, parsed.data);
  } catch (err) {
    if (err instanceof ForbiddenError || err instanceof QuotaError) {
      return { error: err.message };
    }
    throw err;
  }
  revalidatePath("/app/contacts");
  redirect("/app/contacts");
}

export async function updateContactAction(
  id: string,
  _prev: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const user = await requireUser();
  const parsed = parse(formData);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    await updateContact(user, id, parsed.data);
  } catch (err) {
    if (err instanceof ForbiddenError) return { error: err.message };
    throw err;
  }
  revalidatePath("/app/contacts");
  redirect("/app/contacts");
}

export async function deleteContactAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id"));
  try {
    await deleteContact(user, id);
  } catch (err) {
    if (!(err instanceof ForbiddenError)) throw err;
  }
  revalidatePath("/app/contacts");
}

export interface ImportState {
  result?: ImportResult;
  error?: string;
}

export async function importContactsAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const user = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Please choose a CSV file" };
  }
  if (file.size > 2 * 1024 * 1024) {
    return { error: "File too large (max 2MB)" };
  }
  const text = await file.text();
  try {
    const result = await importContactsCsv(user, text);
    revalidatePath("/app/contacts");
    return { result };
  } catch (err) {
    if (err instanceof ForbiddenError || err instanceof QuotaError) {
      return { error: err.message };
    }
    throw err;
  }
}
