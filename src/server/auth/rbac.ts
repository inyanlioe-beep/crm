import type { Role } from "@/server/services/tenant";

/**
 * Role-based access control.
 *
 * Roles (highest to lowest privilege):
 *  - owner:  full control incl. billing + deleting the workspace
 *  - admin:  manage members + all CRM data
 *  - sales:  create/edit CRM data (contacts, deals, activities)
 *  - viewer: read-only
 *
 * Permissions are coarse-grained capabilities checked at action boundaries.
 */
export type Permission =
  | "members:view"
  | "members:invite"
  | "members:update_role"
  | "members:remove"
  | "billing:manage"
  | "crm:view"
  | "crm:create"
  | "crm:update"
  | "crm:delete";

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: [
    "members:view",
    "members:invite",
    "members:update_role",
    "members:remove",
    "billing:manage",
    "crm:view",
    "crm:create",
    "crm:update",
    "crm:delete",
  ],
  admin: [
    "members:view",
    "members:invite",
    "members:update_role",
    "members:remove",
    "crm:view",
    "crm:create",
    "crm:update",
    "crm:delete",
  ],
  sales: ["crm:view", "crm:create", "crm:update"],
  viewer: ["crm:view"],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Ordering used to prevent privilege escalation when assigning roles. */
const ROLE_RANK: Record<Role, number> = {
  owner: 3,
  admin: 2,
  sales: 1,
  viewer: 0,
};

export function roleRank(role: Role): number {
  return ROLE_RANK[role];
}

/**
 * Whether `actor` may assign `target` role to someone. A user can only grant a
 * role strictly below their own level, and only owners can create owners.
 */
export function canAssignRole(actor: Role, target: Role): boolean {
  if (target === "owner") return actor === "owner";
  return roleRank(actor) > roleRank(target) || actor === "owner";
}

export class ForbiddenError extends Error {
  constructor(message = "You do not have permission to do that") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Throw ForbiddenError unless the role has the permission. */
export function requirePermission(role: Role, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new ForbiddenError();
  }
}
