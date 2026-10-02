import Link from "next/link";
import { Button } from "@/components/ui/button";

const features = [
  {
    title: "Contacts & Companies",
    description:
      "Centralize every customer, lead, and account with tags and custom fields.",
  },
  {
    title: "Sales Pipeline",
    description:
      "Track deals across stages with a drag-and-drop kanban and forecasting.",
  },
  {
    title: "Activities & Tasks",
    description: "Notes, follow-ups, reminders, and a full interaction timeline.",
  },
  {
    title: "Email & Comms",
    description: "Send transactional email and log every conversation.",
  },
  {
    title: "Dashboards",
    description: "Real-time metrics on pipeline value, conversion, and activity.",
  },
  {
    title: "Multi-tenant & Secure",
    description: "Row-level security keeps every workspace fully isolated.",
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col items-center px-6 py-20">
      <section className="text-center">
        <span className="inline-block rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
          B2B SaaS CRM
        </span>
        <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">
          The CRM built for growing sales teams
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          Manage contacts, close deals, and keep every workspace secure with
          multi-tenant isolation out of the box.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link href="/register">
            <Button size="lg">Get started</Button>
          </Link>
          <Link href="/login">
            <Button variant="outline" size="lg">
              Sign in
            </Button>
          </Link>
        </div>
      </section>

      <section className="mt-20 grid w-full gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <div
            key={f.title}
            className="rounded-lg border border-border bg-card p-6 text-card-foreground"
          >
            <h3 className="font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{f.description}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
