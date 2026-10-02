"use server";

import { redirect } from "next/navigation";
import {
  register,
  login,
  invalidateSession,
  AuthError,
} from "@/server/auth/auth";
import {
  setSessionCookie,
  clearSessionCookie,
  readSessionCookie,
} from "@/server/auth/cookies";
import { registerSchema, loginSchema } from "@/server/auth/validation";
import { getRateLimiter } from "@/server/security/rate-limit";
import { getClientIp } from "@/server/security/request-ip";

export interface AuthFormState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

export async function registerAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = registerSchema.safeParse({
    tenantName: formData.get("tenantName"),
    ownerName: formData.get("ownerName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  // Throttle signups per IP (10 / hour) to curb abuse.
  const ip = await getClientIp();
  const limiter = getRateLimiter("register", { max: 10, windowMs: 60 * 60_000 });
  const rl = await limiter.limit(ip);
  if (!rl.allowed) {
    return { error: "Too many sign-up attempts. Please try again later." };
  }

  try {
    const result = await register(parsed.data);
    await setSessionCookie(result.token, result.expiresAt);
  } catch (err) {
    if (err instanceof AuthError) return { error: err.message };
    throw err;
  }
  redirect("/app");
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  // Throttle credential attempts per IP+email (5 / 5 min).
  const ip = await getClientIp();
  const limiter = getRateLimiter("login", { max: 5, windowMs: 5 * 60_000 });
  const rl = await limiter.limit(`${ip}:${parsed.data.email.toLowerCase()}`);
  if (!rl.allowed) {
    return { error: "Too many attempts. Please try again in a few minutes." };
  }

  try {
    const result = await login(parsed.data);
    await setSessionCookie(result.token, result.expiresAt);
  } catch (err) {
    if (err instanceof AuthError) return { error: err.message };
    throw err;
  }
  redirect("/app");
}

export async function logoutAction(): Promise<void> {
  const token = await readSessionCookie();
  if (token) await invalidateSession(token);
  await clearSessionCookie();
  redirect("/login");
}
