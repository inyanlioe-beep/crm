import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "./session";
import { validateSessionDetailed, type SessionUser } from "./auth";

/**
 * Read and validate the session from the request cookie. Returns null when no
 * valid session exists. Safe to call in Server Components, Route Handlers, and
 * Server Actions.
 *
 * When the session is slid forward (sliding expiration), the cookie is
 * re-issued with the new expiry. Cookie writes are only permitted in Server
 * Actions / Route Handlers; during a Server Component render they throw, so
 * that case is swallowed — the DB expiry has already been extended, and the
 * cookie will be refreshed on the next action/route request.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const result = await validateSessionDetailed(token);
  if (!result) return null;

  if (result.refreshedExpiry) {
    try {
      store.set(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        expires: result.refreshedExpiry,
      });
    } catch {
      // Read-only cookie context (Server Component render) — ignore.
    }
  }

  return result.user;
}

/** Like getCurrentUser but redirects to /login when unauthenticated. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
