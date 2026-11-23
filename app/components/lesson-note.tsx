import { useFetcher } from "react-router";
import { NotebookPen } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Textarea } from "~/components/ui/textarea";
import { formatRelativeTime } from "~/lib/utils";

export type LessonNoteData = { body: string; updatedAt: string } | null;

/**
 * The Student's private Note on a lesson. Styled as a sibling of
 * Questions & Discussion so the two read as one section under the lesson.
 */
export function LessonNote({ note }: { note: LessonNoteData }) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const isSaving = fetcher.state !== "idle";
  const error = fetcher.data?.error;

  return (
    <Card className="mb-8 py-0">
      <CardContent className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <NotebookPen className="size-5 text-primary" />
          <h2 className="text-xl font-semibold">Your notes</h2>
        </div>

        <fetcher.Form method="post" className="space-y-2">
          <input type="hidden" name="intent" value="save-note" />
          <Textarea
            name="body"
            rows={4}
            defaultValue={note?.body ?? ""}
            placeholder="Jot down what you want to remember. Only you can read this."
            className="min-h-24 resize-y"
          />
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save note"}
            </Button>
            {error && <span className="text-sm text-red-600">{error}</span>}
            {!error && note && (
              <span
                suppressHydrationWarning
                className="text-xs text-muted-foreground"
              >
                Last edited {formatRelativeTime(note.updatedAt)}
              </span>
            )}
          </div>
        </fetcher.Form>
      </CardContent>
    </Card>
  );
}
