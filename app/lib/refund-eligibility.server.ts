import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { db as appDb } from "~/db";
import {
  coupons,
  lessonProgress,
  LessonProgressStatus,
  lessons,
  modules,
  videoWatchEvents,
} from "~/db/schema";

export type Db = typeof appDb;

export const REFUND_WINDOW_DAYS = 14;
export const MAX_WATCHED_HOURS = 2;

// The fourteen-day window is counted in whole days, not hours — someone who
// buys at 23:00 should still get the whole of their fourteenth day.
export function calendarDay(when: Date): string {
  const month = String(when.getMonth() + 1).padStart(2, "0");
  const day = String(when.getDate()).padStart(2, "0");
  return `${when.getFullYear()}-${month}-${day}`;
}

export function lastDayOfWindow(purchasedAtIso: string): string {
  const deadline = new Date(purchasedAtIso);
  deadline.setDate(deadline.getDate() + REFUND_WINDOW_DAYS);
  return calendarDay(deadline);
}

export function getLessonIdsForCourse(database: Db, courseId: number) {
  return database
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .all()
    .map((row) => row.id);
}

export function getWatchedSeconds(
  database: Db,
  userId: number,
  courseId: number
): number {
  const lessonIds = getLessonIdsForCourse(database, courseId);
  if (lessonIds.length === 0) return 0;

  const furthestPerLesson = database
    .select({
      furthest: sql<number>`max(${videoWatchEvents.positionSeconds})`,
    })
    .from(videoWatchEvents)
    .where(
      and(
        eq(videoWatchEvents.userId, userId),
        inArray(videoWatchEvents.lessonId, lessonIds)
      )
    )
    .groupBy(videoWatchEvents.lessonId)
    .all();

  return furthestPerLesson.reduce((total, row) => total + row.furthest, 0);
}

export function getLessonsCompleted(
  database: Db,
  userId: number,
  courseId: number
) {
  const lessonIds = getLessonIdsForCourse(database, courseId);
  if (lessonIds.length === 0) return { completed: 0, total: 0 };

  const row = database
    .select({ count: sql<number>`count(*)` })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.status, LessonProgressStatus.Completed),
        inArray(lessonProgress.lessonId, lessonIds)
      )
    )
    .get();

  return { completed: row?.count ?? 0, total: lessonIds.length };
}

/**
 * Each rule a purchase must meet before a learner may raise a Refund Request.
 * The window is judged as of `asOf` (when the request was or is being raised);
 * watch time is everything watched so far.
 */
export function getRefundRules(
  database: Db,
  input: {
    purchase: { id: number; createdAt: string };
    userId: number;
    courseId: number;
    asOf: Date;
  }
) {
  const claimedSeat = database
    .select({ id: coupons.id })
    .from(coupons)
    .where(
      and(
        eq(coupons.purchaseId, input.purchase.id),
        isNotNull(coupons.redeemedAt)
      )
    )
    .get();

  const lastDay = lastDayOfWindow(input.purchase.createdAt);
  const watchedSeconds = getWatchedSeconds(
    database,
    input.userId,
    input.courseId
  );

  return {
    notClaimedTeamSeat: !claimedSeat,
    withinRefundWindow: calendarDay(input.asOf) <= lastDay,
    lastDayOfWindow: lastDay,
    underWatchLimit: watchedSeconds < MAX_WATCHED_HOURS * 60 * 60,
    watchedSeconds,
  };
}
