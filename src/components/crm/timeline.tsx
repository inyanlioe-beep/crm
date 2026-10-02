"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  addNoteAction,
  addTaskAction,
  toggleTaskAction,
  deleteActivityAction,
  type ActivityState,
} from "@/app/app/activities-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/utils";
import type { TimelineItem } from "@/server/services/activities";

const initial: ActivityState = {};

function PendingButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving..." : label}
    </Button>
  );
}

function typeLabel(t: TimelineItem["type"]): string {
  switch (t) {
    case "note":
      return "Note";
    case "task":
      return "Task";
    case "email":
      return "Email";
    case "call":
      return "Call";
    case "meeting":
      return "Meeting";
    case "stage_change":
      return "Stage change";
  }
}

export function Timeline({
  items,
  contactId,
  dealId,
  canEdit,
}: {
  items: TimelineItem[];
  contactId?: string;
  dealId?: string;
  canEdit: boolean;
}) {
  const [noteState, noteAction] = useActionState(addNoteAction, initial);
  const [taskState, taskAction] = useActionState(addTaskAction, initial);

  const hidden = (
    <>
      {contactId && <input type="hidden" name="contactId" value={contactId} />}
      {dealId && <input type="hidden" name="dealId" value={dealId} />}
    </>
  );

  return (
    <section className="space-y-6">
      <h2 className="text-lg font-semibold">Activity</h2>

      {canEdit && (
        <div className="grid gap-4 sm:grid-cols-2">
          <form
            action={noteAction}
            className="space-y-2 rounded-lg border border-border p-3"
          >
            {hidden}
            <Label htmlFor="note-body">Add note</Label>
            <textarea
              id="note-body"
              name="body"
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Log a note..."
            />
            {noteState.error && (
              <p className="text-sm text-destructive">{noteState.error}</p>
            )}
            <PendingButton label="Add note" />
          </form>

          <form
            action={taskAction}
            className="space-y-2 rounded-lg border border-border p-3"
          >
            {hidden}
            <Label htmlFor="task-subject">Add task</Label>
            <Input id="task-subject" name="subject" placeholder="Follow up..." />
            <Input id="task-due" name="dueAt" type="date" aria-label="Due date" />
            {taskState.error && (
              <p className="text-sm text-destructive">{taskState.error}</p>
            )}
            <PendingButton label="Add task" />
          </form>
        </div>
      )}

      <ol className="space-y-3">
        {items.length === 0 && (
          <li className="text-sm text-muted-foreground">No activity yet.</li>
        )}
        {items.map((item) => {
          const isTask = item.type === "task";
          const done = Boolean(item.completedAt);
          return (
            <li
              key={item.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-border p-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-secondary px-2 py-0.5 text-xs">
                    {typeLabel(item.type)}
                  </span>
                  {isTask && item.dueAt && (
                    <span
                      className={
                        !done && item.dueAt.getTime() < Date.now()
                          ? "text-xs text-destructive"
                          : "text-xs text-muted-foreground"
                      }
                    >
                      Due {formatDate(item.dueAt)}
                    </span>
                  )}
                  {isTask && done && (
                    <span className="text-xs text-green-600">Completed</span>
                  )}
                </div>
                {item.subject && (
                  <p
                    className={
                      done
                        ? "mt-1 font-medium line-through"
                        : "mt-1 font-medium"
                    }
                  >
                    {item.subject}
                  </p>
                )}
                {item.body && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                    {item.body}
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.createdByName ?? "Someone"} · {formatDate(item.createdAt)}
                </p>
              </div>
              {canEdit && (
                <div className="flex shrink-0 flex-col gap-1">
                  {isTask && (
                    <form action={toggleTaskAction}>
                      <input type="hidden" name="id" value={item.id} />
                      <input
                        type="hidden"
                        name="complete"
                        value={done ? "false" : "true"}
                      />
                      {contactId && (
                        <input type="hidden" name="contactId" value={contactId} />
                      )}
                      {dealId && (
                        <input type="hidden" name="dealId" value={dealId} />
                      )}
                      <Button type="submit" size="sm" variant="outline">
                        {done ? "Reopen" : "Complete"}
                      </Button>
                    </form>
                  )}
                  <form action={deleteActivityAction}>
                    <input type="hidden" name="id" value={item.id} />
                    {contactId && (
                      <input type="hidden" name="contactId" value={contactId} />
                    )}
                    {dealId && (
                      <input type="hidden" name="dealId" value={dealId} />
                    )}
                    <Button type="submit" size="sm" variant="ghost">
                      Delete
                    </Button>
                  </form>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
