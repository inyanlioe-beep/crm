import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SessionUser } from "@/server/auth/auth";

/**
 * Integration tests for activities (notes, tasks, timeline). Skipped unless
 * TEST_DATABASE_URL is set (app_user / NOBYPASSRLS). See db/README.md.
 */
const TEST_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_URL ? describe : describe.skip;

describeIfDb("activities service", () => {
  let svc: typeof import("./activities");
  let contactsSvc: typeof import("./contacts");
  let client: typeof import("@/server/db/client");
  let tenantSvc: typeof import("./tenant");
  let user: SessionUser;
  let contactId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL!;
    process.env.DATABASE_ADMIN_URL =
      process.env.TEST_ADMIN_DATABASE_URL ?? TEST_URL!;
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? "test-secret-that-is-at-least-32-chars-long";

    svc = await import("./activities");
    contactsSvc = await import("./contacts");
    client = await import("@/server/db/client");
    tenantSvc = await import("./tenant");

    const stamp = Date.now();
    const created = await tenantSvc.createTenantWithOwner({
      tenantName: "Activities Co",
      slug: `act-${stamp}`,
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
    const c = await contactsSvc.createContact(user, { firstName: "Timeline" });
    contactId = c.id;
  });

  afterAll(async () => {
    await client?.closeDb();
  });

  it("adds notes and tasks to a contact timeline (newest first)", async () => {
    await svc.addNote(user, { contactId, body: "First note" });
    await svc.addTask(user, { contactId, subject: "Follow up" });
    const timeline = await svc.listTimeline(user, { contactId });
    expect(timeline.length).toBeGreaterThanOrEqual(2);
    expect(timeline.some((i) => i.type === "note")).toBe(true);
    expect(timeline.some((i) => i.type === "task")).toBe(true);
  });

  it("lists open tasks and hides completed ones", async () => {
    const { id } = await svc.addTask(user, {
      contactId,
      subject: "Complete me",
    });
    let open = await svc.listTasks(user, "open");
    expect(open.some((t) => t.id === id)).toBe(true);

    await svc.setTaskComplete(user, id, true);
    open = await svc.listTasks(user, "open");
    expect(open.some((t) => t.id === id)).toBe(false);

    const completed = await svc.listTasks(user, "completed");
    expect(completed.some((t) => t.id === id)).toBe(true);
  });

  it("flags overdue tasks", async () => {
    const past = new Date(Date.now() - 86_400_000);
    const { id } = await svc.addTask(user, {
      contactId,
      subject: "Overdue task",
      dueAt: past,
    });
    const overdue = await svc.listTasks(user, "overdue");
    expect(overdue.some((t) => t.id === id)).toBe(true);
  });

  it("prevents a viewer from adding a note", async () => {
    const viewer: SessionUser = { ...user, role: "viewer" };
    await expect(
      svc.addNote(viewer, { contactId, body: "nope" }),
    ).rejects.toThrow();
  });
});
