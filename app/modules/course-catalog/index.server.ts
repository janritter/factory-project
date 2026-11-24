import { db } from "~/db";
import type { Db } from "~/db/types";
import { countLessonsByCourse } from "./lib/lesson-counts";
import { getStartPage } from "./lib/start-page";

export type { FeaturedCourse, StartPage } from "./lib/start-page";

/**
 * The published course catalogue bound to a database. The app uses
 * `courseCatalog`, which reads the app database; tests build their own
 * against a test database.
 */
export function createCourseCatalog(database: Db) {
  return {
    /** The newest published courses and the catalogue totals the start page shows. */
    startPage() {
      return getStartPage(database);
    },
    /** Lesson totals per course id, in one query; unknown or empty courses map to 0. */
    lessonCounts(courseIds: readonly number[]) {
      return countLessonsByCourse(database, courseIds);
    },
  };
}

export const courseCatalog = /* @__PURE__ */ createCourseCatalog(db);
