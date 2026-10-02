import { describe, it, expect } from "vitest";
import {
  hasPermission,
  canAssignRole,
  requirePermission,
  ForbiddenError,
} from "./rbac";

describe("rbac permissions", () => {
  it("owner can manage billing and members", () => {
    expect(hasPermission("owner", "billing:manage")).toBe(true);
    expect(hasPermission("owner", "members:remove")).toBe(true);
    expect(hasPermission("owner", "crm:delete")).toBe(true);
  });

  it("admin manages members but not billing", () => {
    expect(hasPermission("admin", "members:invite")).toBe(true);
    expect(hasPermission("admin", "billing:manage")).toBe(false);
  });

  it("sales can create/update CRM data but not delete or manage members", () => {
    expect(hasPermission("sales", "crm:create")).toBe(true);
    expect(hasPermission("sales", "crm:update")).toBe(true);
    expect(hasPermission("sales", "crm:delete")).toBe(false);
    expect(hasPermission("sales", "members:invite")).toBe(false);
  });

  it("viewer is read-only", () => {
    expect(hasPermission("viewer", "crm:view")).toBe(true);
    expect(hasPermission("viewer", "crm:create")).toBe(false);
    expect(hasPermission("viewer", "crm:update")).toBe(false);
  });
});

describe("role assignment guards", () => {
  it("only an owner can assign the owner role", () => {
    expect(canAssignRole("owner", "owner")).toBe(true);
    expect(canAssignRole("admin", "owner")).toBe(false);
  });

  it("admin can assign sales and viewer", () => {
    expect(canAssignRole("admin", "sales")).toBe(true);
    expect(canAssignRole("admin", "viewer")).toBe(true);
  });

  it("sales cannot assign admin", () => {
    expect(canAssignRole("sales", "admin")).toBe(false);
  });
});

describe("requirePermission", () => {
  it("throws ForbiddenError when lacking permission", () => {
    expect(() => requirePermission("viewer", "crm:delete")).toThrow(
      ForbiddenError,
    );
  });

  it("does not throw when permitted", () => {
    expect(() => requirePermission("owner", "crm:delete")).not.toThrow();
  });
});
