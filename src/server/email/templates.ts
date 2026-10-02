/**
 * Simple, dependency-free HTML email templates. Kept minimal and inline-styled
 * for broad client compatibility. (React Email could be swapped in later.)
 */

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Convert plain text (with newlines) to simple paragraph HTML. */
export function textToHtml(body: string): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.6;color:#111">${paragraphs}</div>`;
}

export interface ContactEmailTemplate {
  subject: string;
  html: string;
  text: string;
}

/** Build the payload for a free-form email sent to a contact. */
export function buildContactEmail(input: {
  subject: string;
  body: string;
}): ContactEmailTemplate {
  return {
    subject: input.subject,
    text: input.body,
    html: textToHtml(input.body),
  };
}
