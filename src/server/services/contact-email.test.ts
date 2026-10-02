import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SessionUser } from "@/server/auth/auth";
import type { SendEmailInput } from "@/server/email/email";

/**
 * Integration test for sending a contact email + logging it. Skipped unless
 * TEST_DATABASE_URL is set. Uses a mock email provider (no network).
 */
const TEST_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_URL ? describe : describe.skip;

describeIfDb("sendContactEmail", () => {
  let emailSvc: typeof import("./contact-email");
  let contactsSvc: typeof import("./contacts");
  let activitiesSvc: typeof import("./activities");
  let email: typeof import("@/server/email/email");
  let client: typeof import("@/server/db/client");
  let tenantSvc: typeof import("./tenant");
  let user: SessionUser;
  const sent: SendEmailInput[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL!;
    process.env.DATABASE_ADMIN_URL =
      process.env.TEST_ADMIN_DATABASE_URL ?? TEST_URL!;
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? "test-secret-that-is-at-least-32-chars-long";

    emailSvc = await import("./contact-email");
    contactsSvc = await import("./contacts");
    activitiesSvc = await import("./activities");
    email = await import("@/server/email/email");
    client = await import("@/server/db/client");
    tenantSvc = await import("./tenant");

    email.setEmailProvider({
      send: async (input) => {
        sent.push(input);
        return { id: "mock-message-id" };
      },
    });

    const stamp = Date.now();
    const created = await tenantSvc.createTenantWithOwner({
      tenantName: "Email Co",
      slug: `email-${stamp}`,
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
    email.setEmailProvider(null);
    await client?.closeDb();
  });

  it("sends to the contact's email and logs an email activity", async () => {
    const contact = await contactsSvc.createContact(user, {
      firstName: "Mailee",
      email: "mailee@example.com",
    });

    const result = await emailSvc.sendContactEmail(user, {
      contactId: contact.id,
      subject: "Welcome",
      body: "Thanks for your interest.",
    });

    expect(result.messageId).toBe("mock-message-id");
    expect(sent.at(-1)?.to).toBe("mailee@example.com");
    expect(sent.at(-1)?.subject).toBe("Welcome");

    const timeline = await activitiesSvc.listTimeline(user, {
      contactId: contact.id,
    });
    expect(timeline.some((i) => i.type === "email")).toBe(true);
  });

  it("throws when the contact has no email address", async () => {
    const contact = await contactsSvc.createContact(user, {
      firstName: "NoEmail",
    });
    await expect(
      emailSvc.sendContactEmail(user, {
        contactId: contact.id,
        subject: "x",
        body: "y",
      }),
    ).rejects.toThrow();
  });
});
