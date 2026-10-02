import { getEnv } from "@/lib/env";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailProvider {
  send(input: SendEmailInput): Promise<{ id: string | null }>;
}

/**
 * Resend-backed provider. Uses the HTTP API directly to avoid an extra SDK
 * dependency. When RESEND_API_KEY is empty (local/dev/test), falls back to a
 * console provider so flows that send email don't crash.
 */
class ResendProvider implements EmailProvider {
  constructor(
    private apiKey: string,
    private from: string,
  ) {}

  async send(input: SendEmailInput): Promise<{ id: string | null }> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Resend send failed (${res.status}): ${body}`);
    }
    const data = (await res.json()) as { id?: string };
    return { id: data.id ?? null };
  }
}

class ConsoleProvider implements EmailProvider {
  async send(input: SendEmailInput): Promise<{ id: string | null }> {
    console.info(
      `[email:dev] to=${input.to} subject="${input.subject}"\n${input.text ?? input.html}`,
    );
    return { id: null };
  }
}

let provider: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (provider) return provider;
  const env = getEnv();
  provider =
    env.RESEND_API_KEY.length > 0
      ? new ResendProvider(env.RESEND_API_KEY, env.EMAIL_FROM)
      : new ConsoleProvider();
  return provider;
}

/** Test seam: override the active provider (e.g. with a mock). */
export function setEmailProvider(p: EmailProvider | null): void {
  provider = p;
}

export async function sendEmail(
  input: SendEmailInput,
): Promise<{ id: string | null }> {
  return getEmailProvider().send(input);
}
