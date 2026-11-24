import { count, eq, inArray } from "drizzle-orm";
import type { Db } from "~/db/types";
import { lessons, modules } from "~/db/schema";

/** Lesson totals for each course, in one query. A course with no lessons maps to 0. */
export function countLessonsByCourse(
  database: Db,
  courseIds: readonly number[]
): Map<number, number> {
  const totals = new Map(courseIds.map((id) => [id, 0]));
  if (courseIds.length === 0) return totals;

  const rows = database
    .select({ courseId: modules.courseId, lessonCount: count(lessons.id) })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(inArray(modules.courseId, [...courseIds]))
    .groupBy(modules.courseId)
    .all();

  for (const row of rows) totals.set(row.courseId, row.lessonCount);
  return totals;
}
