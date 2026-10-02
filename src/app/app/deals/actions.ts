"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/server/auth/current-user";
import { ForbiddenError } from "@/server/auth/rbac";
import {
  createDeal,
  updateDeal,
  deleteDeal,
  moveDeal,
} from "@/server/services/deals";
import { QuotaError } from "@/server/services/subscription";

const emptyToUndef = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

const dealSchema = z.object({
  title: z.string().min(1, "Title is required").max(160),
  // dollars (or major units) in the form -> convert to cents
  value: z.coerce.number().min(0).max(1_000_000_000).default(0),
  currency: z.string().default("USD"),
  stageId: z.preprocess(emptyToUndef, z.string().uuid().optional()),
  contactId: z.preprocess(emptyToUndef, z.string().uuid().optional()),
  companyId: z.preprocess(emptyToUndef, z.string().uuid().optional()),
  expectedCloseDate: z.preprocess(
    emptyToUndef,
    z.string().optional(),
  ),
});

export interface DealFormState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

function parse(formData: FormData) {
  return dealSchema.safeParse({
    title: formData.get("title"),
    value: formData.get("value"),
    currency: formData.get("currency"),
    stageId: formData.get("stageId"),
    contactId: formData.get("contactId"),
    companyId: formData.get("companyId"),
    expectedCloseDate: formData.get("expectedCloseDate"),
  });
}

function toServiceInput(data: z.infer<typeof dealSchema>) {
  return {
    title: data.title,
    valueCents: Math.round(data.value * 100),
    currency: data.currency,
    stageId: data.stageId,
    contactId: data.contactId ?? null,
    companyId: data.companyId ?? null,
    expectedCloseDate: data.expectedCloseDate
      ? new Date(data.expectedCloseDate)
      : null,
  };
}

export async function createDealAction(
  _prev: DealFormState,
  formData: FormData,
): Promise<DealFormState> {
  const user = await requireUser();
  const parsed = parse(formData);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    await createDeal(user, toServiceInput(parsed.data));
  } catch (err) {
    if (err instanceof ForbiddenError || err instanceof QuotaError) {
      return { error: err.message };
    }
    throw err;
  }
  revalidatePath("/app/deals");
  redirect("/app/deals");
}

export async function updateDealAction(
  id: string,
  _prev: DealFormState,
  formData: FormData,
): Promise<DealFormState> {
  const user = await requireUser();
  const parsed = parse(formData);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    await updateDeal(user, id, toServiceInput(parsed.data));
  } catch (err) {
    if (err instanceof ForbiddenError) return { error: err.message };
    throw err;
  }
  revalidatePath("/app/deals");
  redirect("/app/deals");
}

export async function deleteDealAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id"));
  try {
    await deleteDeal(user, id);
  } catch (err) {
    if (!(err instanceof ForbiddenError)) throw err;
  }
  revalidatePath("/app/deals");
}

const moveSchema = z.object({
  dealId: z.string().uuid(),
  toStageId: z.string().uuid(),
  toIndex: z.coerce.number().int().min(0),
});

export interface MoveResult {
  ok: boolean;
  error?: string;
}

/** Called by the kanban board after a drag. Returns a status (no redirect). */
export async function moveDealAction(input: {
  dealId: string;
  toStageId: string;
  toIndex: number;
}): Promise<MoveResult> {
  const user = await requireUser();
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid move" };
  try {
    await moveDeal(user, parsed.data);
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    return { ok: false, error: "Could not move deal" };
  }
  revalidatePath("/app/deals");
  return { ok: true };
}
