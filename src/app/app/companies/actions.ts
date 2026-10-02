"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/current-user";
import { ForbiddenError } from "@/server/auth/rbac";
import {
  createCompany,
  updateCompany,
  deleteCompany,
} from "@/server/services/companies";
import { companyFormSchema } from "@/server/services/crm-validation";

export interface CompanyFormState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

function parse(formData: FormData) {
  return companyFormSchema.safeParse({
    name: formData.get("name"),
    domain: formData.get("domain"),
    industry: formData.get("industry"),
    tags: formData.get("tags"),
  });
}

export async function createCompanyAction(
  _prev: CompanyFormState,
  formData: FormData,
): Promise<CompanyFormState> {
  const user = await requireUser();
  const parsed = parse(formData);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    await createCompany(user, parsed.data);
  } catch (err) {
    if (err instanceof ForbiddenError) return { error: err.message };
    throw err;
  }
  revalidatePath("/app/companies");
  redirect("/app/companies");
}

export async function updateCompanyAction(
  id: string,
  _prev: CompanyFormState,
  formData: FormData,
): Promise<CompanyFormState> {
  const user = await requireUser();
  const parsed = parse(formData);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    await updateCompany(user, id, parsed.data);
  } catch (err) {
    if (err instanceof ForbiddenError) return { error: err.message };
    throw err;
  }
  revalidatePath("/app/companies");
  redirect("/app/companies");
}

export async function deleteCompanyAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id"));
  try {
    await deleteCompany(user, id);
  } catch (err) {
    if (!(err instanceof ForbiddenError)) throw err;
  }
  revalidatePath("/app/companies");
}
