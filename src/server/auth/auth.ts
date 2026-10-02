import { eq, and } from "drizzle-orm";
import { getAdminDb } from "@/server/db/client";
import { users, sessions, tenants } from "@/server/db/schema";
import { hashPassword, verifyPassword } from "./password";
import {
  generateSessionToken,
  hashSessionToken,
  sessionExpiry,
  shouldRefresh,
} from "./session";
import { createTenantWithOwner, type Role } from "@/server/services/tenant";

export interface SessionUser {
  userId: string;
  tenantId: string;
  email: string;
  name: string;
  role: Role;
}

export interface AuthResult {
  token: string;
  expiresAt: Date;
  user: SessionUser;
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "workspace"
  );
}

export class AuthError extends Error {}

/**
 * Register a new workspace: creates the tenant, the owner user, a free
 * subscription, and the default pipeline, then opens a session.
 * Login/registration run on the admin connection because there is no tenant
 * session yet. Email uniqueness is enforced globally for login simplicity.
 */
export async function register(input: {
  tenantName: string;
  ownerName: string;
  email: string;
  password: string;
}): Promise<AuthResult> {
  const db = getAdminDb();
  const email = input.email.toLowerCase().trim();

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing.length > 0) {
    throw new AuthError("An account with this email already exists");
  }

  // Ensure a unique slug.
  let slug = slugify(input.tenantName);
  const slugTaken = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);
  if (slugTaken.length > 0) slug = `${slug}-${Date.now().toString(36)}`;

  const passwordHash = await hashPassword(input.password);
  const { tenantId, userId } = await createTenantWithOwner({
    tenantName: input.tenantName,
    slug,
    ownerEmail: email,
    ownerName: input.ownerName,
    passwordHash,
  });

  const session = await createSession(userId, tenantId);
  return {
    ...session,
    user: {
      userId,
      tenantId,
      email,
      name: input.ownerName,
      role: "owner",
    },
  };
}

/** Authenticate by email + password and open a session. */
export async function login(input: {
  email: string;
  password: string;
}): Promise<AuthResult> {
  const db = getAdminDb();
  const email = input.email.toLowerCase().trim();

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  // Always run verify to reduce timing side-channels, even if user is absent.
  const hash = user?.passwordHash ?? "$argon2id$v=19$m=65536,t=3,p=4$0000$0000";
  const ok = await verifyPassword(hash, input.password);
  if (!user || !ok) {
    throw new AuthError("Invalid email or password");
  }

  const session = await createSession(user.id, user.tenantId);
  return {
    ...session,
    user: {
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  };
}

/** Create a session row (stores only the token hash) and return the raw token. */
export async function createSession(
  userId: string,
  tenantId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const id = hashSessionToken(token);
  const expiresAt = sessionExpiry();
  await getAdminDb()
    .insert(sessions)
    .values({ id, userId, tenantId, expiresAt });
  return { token, expiresAt };
}

export interface ValidatedSession {
  user: SessionUser;
  /** New expiry if the session was slid forward this call, else null. */
  refreshedExpiry: Date | null;
}

/**
 * Validate a raw session token. Returns the session user (+ any refreshed
 * expiry) or null. Deletes the row if expired. Admin connection is used
 * because the session lookup must happen before a tenant context is
 * established.
 *
 * Implements sliding expiration: once a session passes the halfway point of
 * its TTL, its DB expiry is extended and the new expiry is returned so the
 * caller can re-issue the cookie.
 */
export async function validateSessionDetailed(
  token: string,
): Promise<ValidatedSession | null> {
  if (!token) return null;
  const id = hashSessionToken(token);
  const db = getAdminDb();

  const rows = await db
    .select({
      session: sessions,
      user: users,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  if (row.session.expiresAt.getTime() <= Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }

  // Sliding renewal: extend the session when it's past the halfway mark.
  let refreshedExpiry: Date | null = null;
  if (shouldRefresh(row.session.expiresAt)) {
    refreshedExpiry = sessionExpiry();
    await db
      .update(sessions)
      .set({ expiresAt: refreshedExpiry })
      .where(eq(sessions.id, id));
  }

  return {
    user: {
      userId: row.user.id,
      // Use the tenant recorded on the SESSION, not the user row, so the
      // active-workspace context is authoritative (future multi-workspace).
      tenantId: row.session.tenantId,
      email: row.user.email,
      name: row.user.name,
      role: row.user.role,
    },
    refreshedExpiry,
  };
}

/** Backwards-compatible helper returning just the user. */
export async function validateSession(
  token: string,
): Promise<SessionUser | null> {
  const result = await validateSessionDetailed(token);
  return result?.user ?? null;
}

export async function invalidateSession(token: string): Promise<void> {
  if (!token) return;
  const id = hashSessionToken(token);
  await getAdminDb().delete(sessions).where(eq(sessions.id, id));
}

export async function invalidateAllUserSessions(
  userId: string,
  tenantId: string,
): Promise<void> {
  await getAdminDb()
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), eq(sessions.tenantId, tenantId)));
}
