import { describe, it, expect } from "vitest";
import { buildContactEmail, textToHtml } from "./templates";

describe("email templates", () => {
  it("builds a contact email with subject, text, and html", () => {
    const t = buildContactEmail({ subject: "Hi", body: "Hello there" });
    expect(t.subject).toBe("Hi");
    expect(t.text).toBe("Hello there");
    expect(t.html).toContain("Hello there");
  });

  it("escapes HTML to prevent injection", () => {
    const t = buildContactEmail({
      subject: "x",
      body: "<script>alert(1)</script>",
    });
    expect(t.html).not.toContain("<script>");
    expect(t.html).toContain("&lt;script&gt;");
  });

  it("converts blank-line-separated text into paragraphs", () => {
    const html = textToHtml("Para one\n\nPara two");
    const paragraphs = html.match(/<p /g) ?? [];
    expect(paragraphs.length).toBe(2);
  });

  it("converts single newlines into line breaks", () => {
    const html = textToHtml("Line one\nLine two");
    expect(html).toContain("<br/>");
  });
});
