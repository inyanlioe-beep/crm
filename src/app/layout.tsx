import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CRM SaaS",
  description: "Multi-tenant CRM for sales teams",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
