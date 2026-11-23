// Production entry point for the instructor analytics route. Binds the real
// database, so callers never pass `db` around. `now` stays a parameter so the
// loader owns the clock.
import type { AnalyticsRange } from "~/lib/analytics";
import { db } from "~/db";
import * as analytics from "./lib/instructor-analytics.server";
import type {
  AnalyticsOptions,
  AnalyticsScope,
  CourseReport,
  Overview,
} from "./index";

export function getOverview(scope: AnalyticsScope, now: Date): Overview {
  return analytics.getOverview(db, scope, now);
}

export function getCourseReport(
  courseId: number,
  range: AnalyticsRange,
  now: Date
): CourseReport {
  return analytics.getCourseReport(db, courseId, range, now);
}

export function getAnalyticsOptions(
  instructorId: number | null,
  opts: { includeInstructors: boolean }
): AnalyticsOptions {
  return analytics.getAnalyticsOptions(db, instructorId, opts);
}
