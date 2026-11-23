import { Link } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "~/lib/utils";

type PagerLesson = { id: number; title: string };

export function LessonPager({
  courseSlug,
  courseTitle,
  prevLesson,
  nextLesson,
}: {
  courseSlug: string;
  courseTitle: string;
  prevLesson: PagerLesson | null;
  nextLesson: PagerLesson | null;
}) {
  const lessonPath = (lesson: PagerLesson) =>
    `/courses/${courseSlug}/lessons/${lesson.id}`;

  return (
    <div className="flex items-center justify-between border-t pt-6">
      {prevLesson ? (
        <PagerLink
          to={lessonPath(prevLesson)}
          label="Previous"
          title={prevLesson.title}
          direction="back"
        />
      ) : (
        <div />
      )}

      {nextLesson ? (
        <PagerLink
          to={lessonPath(nextLesson)}
          label="Next"
          title={nextLesson.title}
          direction="forward"
          className="text-right"
        />
      ) : (
        <PagerLink
          to={`/courses/${courseSlug}`}
          label="Back to"
          title={courseTitle}
          direction="forward"
        />
      )}
    </div>
  );
}

function PagerLink({
  to,
  label,
  title,
  direction,
  className,
}: {
  to: string;
  label: string;
  title: string;
  direction: "back" | "forward";
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground",
        className
      )}
    >
      {direction === "back" && <ChevronLeft className="size-4" />}
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-medium text-foreground">{title}</div>
      </div>
      {direction === "forward" && <ChevronRight className="size-4" />}
    </Link>
  );
}
