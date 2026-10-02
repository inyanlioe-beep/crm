"use client";

import { useState } from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import { moveDealAction } from "./actions";
import type { Board, DealCard } from "@/server/services/deals";

function Card({ deal, canEdit }: { deal: DealCard; canEdit: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: deal.id, data: { stageId: deal.stageId } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-md border border-border bg-background p-3 shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div
          {...attributes}
          {...listeners}
          className="min-w-0 flex-1 cursor-grab active:cursor-grabbing"
          aria-label={`Drag ${deal.title}`}
        >
          <p className="truncate text-sm font-medium">{deal.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatCurrency(deal.valueCents, deal.currency)}
          </p>
          {(deal.companyName || deal.contactName) && (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {[deal.companyName, deal.contactName].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      </div>
      {canEdit && (
        <Link
          href={`/app/deals/${deal.id}`}
          className="mt-2 inline-block text-xs text-primary hover:underline"
        >
          Edit
        </Link>
      )}
    </div>
  );
}

function Column({
  stage,
  canEdit,
}: {
  stage: Board["stages"][number];
  canEdit: boolean;
}) {
  const { setNodeRef } = useSortable({
    id: `stage:${stage.id}`,
    data: { stageId: stage.id, isColumn: true },
  });

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-lg border border-border bg-card">
      <div className="border-b border-border p-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{stage.name}</h3>
          <span className="rounded bg-secondary px-2 py-0.5 text-xs">
            {stage.deals.length}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatCurrency(stage.totalCents)}
        </p>
      </div>
      <div ref={setNodeRef} className="flex-1 space-y-2 p-3">
        <SortableContext
          items={stage.deals.map((d) => d.id)}
          strategy={verticalListSortingStrategy}
        >
          {stage.deals.map((d) => (
            <Card key={d.id} deal={d} canEdit={canEdit} />
          ))}
          {stage.deals.length === 0 && (
            <p className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
              Drop deals here
            </p>
          )}
        </SortableContext>
      </div>
    </div>
  );
}

export function KanbanBoard({
  board,
  canEdit,
}: {
  board: Board;
  canEdit: boolean;
}) {
  const [stages, setStages] = useState(board.stages);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function findStageOfDeal(dealId: string) {
    return stages.find((s) => s.deals.some((d) => d.id === dealId));
  }

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || !canEdit) return;

    const dealId = String(active.id);
    const fromStage = findStageOfDeal(dealId);
    if (!fromStage) return;

    // Determine target stage + index.
    const overId = String(over.id);
    let toStageId: string;
    let toIndex: number;

    if (overId.startsWith("stage:")) {
      toStageId = overId.slice("stage:".length);
      const target = stages.find((s) => s.id === toStageId);
      toIndex = target ? target.deals.length : 0;
    } else {
      const overStage = findStageOfDeal(overId);
      if (!overStage) return;
      toStageId = overStage.id;
      toIndex = overStage.deals.findIndex((d) => d.id === overId);
      if (toIndex < 0) toIndex = overStage.deals.length;
    }

    if (toStageId === fromStage.id) {
      const sameIdx = fromStage.deals.findIndex((d) => d.id === dealId);
      if (sameIdx === toIndex) return;
    }

    // Optimistic update.
    const prev = stages;
    const moving = fromStage.deals.find((d) => d.id === dealId)!;
    const next = stages.map((s) => ({ ...s, deals: [...s.deals] }));
    const src = next.find((s) => s.id === fromStage.id)!;
    src.deals = src.deals.filter((d) => d.id !== dealId);
    const dst = next.find((s) => s.id === toStageId)!;
    dst.deals.splice(toIndex, 0, { ...moving, stageId: toStageId });
    // Recompute totals for affected stages.
    for (const s of next) {
      s.totalCents = s.deals.reduce((sum, d) => sum + d.valueCents, 0);
    }
    setStages(next);
    setError(null);

    const res = await moveDealAction({ dealId, toStageId, toIndex });
    if (!res.ok) {
      setStages(prev); // rollback
      setError(res.error ?? "Could not move deal");
    }
  }

  return (
    <div>
      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragEnd={onDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => (
            <Column key={stage.id} stage={stage} canEdit={canEdit} />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
