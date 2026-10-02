"use client";

import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

const PRESETS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function RangeFilter({ activeDays }: { activeDays: number }) {
  const router = useRouter();
  const pathname = usePathname();

  function apply(days: number) {
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    const params = new URLSearchParams({
      from: isoDay(from),
      to: isoDay(to),
    });
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex gap-2">
      {PRESETS.map((p) => (
        <Button
          key={p.label}
          variant={p.days === activeDays ? "default" : "outline"}
          size="sm"
          onClick={() => apply(p.days)}
        >
          Last {p.label}
        </Button>
      ))}
    </div>
  );
}
