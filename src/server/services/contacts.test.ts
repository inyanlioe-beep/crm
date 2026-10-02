import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SessionUser } from "@/server/auth/auth";

/**
 * Integration tests for contacts + CSV import. Skipped unless TEST_DATABASE_URL
 * is set (app_user / NOBYPASSRLS). See src/server/db/README.md.
 */
const TEST_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_URL ? describe : describe.skip;

describeIfDb("contacts service", () => {
  let contactsSvc: typeof import("./contacts");
  let companiesSvc: typeof import("./companies");
  let client: typeof import("@/server/db/client");
  let tenantSvc: typeof import("./tenant");
  let user: SessionUser;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL!;
    process.env.DATABASE_ADMIN_URL =
      process.env.TEST_ADMIN_DATABASE_URL ?? TEST_URL!;
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? "test-secret-that-is-at-least-32-chars-long";

    contactsSvc = await import("./contacts");
    companiesSvc = await import("./companies");
    client = await import("@/server/db/client");
    tenantSvc = await import("./tenant");

    const stamp = Date.now();
    const created = await tenantSvc.createTenantWithOwner({
      tenantName: "Contacts Co",
      slug: `contacts-${stamp}`,
      ownerEmail: `owner-${stamp}@test.local`,
      ownerName: "Owner",
      passwordHash: "x",
    });
    user = {
      userId: created.userId,
      tenantId: created.tenantId,
      email: `owner-${stamp}@test.local`,
      name: "Owner",
      role: "owner",
    };
  });

  afterAll(async () => {
    await client?.closeDb();
  });

  it("creates and lists a contact", async () => {
    await contactsSvc.createContact(user, {
      firstName: "Alice",
      lastName: "Example",
      email: "alice@example.com",
    });
    const list = await contactsSvc.listContacts(user, {});
    expect(list.items.some((c) => c.email === "alice@example.com")).toBe(true);
  });

  it("searches contacts by name", async () => {
    await contactsSvc.createContact(user, { firstName: "Zephyr" });
    const list = await contactsSvc.listContacts(user, { search: "zephyr" });
    expect(list.items.some((c) => c.firstName === "Zephyr")).toBe(true);
  });

  it("imports contacts from CSV and auto-creates companies", async () => {
    const csv =
      "First Name,Last Name,Email,Company\nBob,Builder,bob@acme.test,Acme Build\n,missing,no@name.test,Acme Build\nCarol,,carol@acme.test,Acme Build";
    const result = await contactsSvc.importContactsCsv(user, csv);
    expect(result.imported).toBe(2); // Bob + Carol; blank-first-name skipped
    expect(result.skipped).toBe(1);

    const companies = await companiesSvc.listCompanies(user, {
      search: "Acme Build",
    });
    expect(companies.items.some((c) => c.name === "Acme Build")).toBe(true);
  });

  it("rejects writes for a viewer", async () => {
    const viewer: SessionUser = { ...user, role: "viewer" };
    await expect(
      contactsSvc.createContact(viewer, { firstName: "Nope" }),
    ).rejects.toThrow();
  });
});
