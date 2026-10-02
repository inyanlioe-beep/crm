import { headers } from "next/headers";

/**
 * Best-effort client IP from standard proxy headers. Used only for coarse
 * rate-limit keys, not for security decisions. Falls back to "unknown".
 */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return h.get("x-real-ip")?.trim() || "unknown";
}
