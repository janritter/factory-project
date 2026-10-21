import { db } from "~/db";
import type { Db } from "~/db/types";
import { getCommentById } from "./lib/thread";
import { markLessonComplete } from "./lib/progress";
import { computeResult, getQuizById } from "./lib/quiz";
import {
  loadLessonPage,
  type FoundCourseDecisions,
} from "./lib/load-lesson-page";

export type { Db } from "~/db/types";

export type QuizSubmission = {
  userId: number;
  lessonId: number;
  quizId: number;
};
export type { FoundCourseDecisions } from "./lib/load-lesson-page";

/** What the lesson page shows: the full lesson, or the "locked" view. */
export type LessonPage = NonNullable<
  Awaited<ReturnType<typeof loadLessonPage>>
>;
export type LockedLessonPage = Extract<LessonPage, { view: "locked" }>;

/**
 * The lesson page bound to a database. The app uses `lessonViewer`, which
 * reads the app database; tests build their own against a test database.
 */
export function createLessonViewer(database: Db) {
  return {
    /**
     * Everything the lesson page shows for this person, or null when the
     * lesson is missing. Viewing records the lesson as in progress for
     * someone who can take the course.
     */
    load(decisions: FoundCourseDecisions, lessonId: number) {
      return loadLessonPage(database, decisions, lessonId);
    },

    /** The comment, only if it belongs to this lesson. */
    findComment(lessonId: number, commentId: number) {
      const comment = getCommentById(database, commentId);
      return comment && comment.lessonId === lessonId ? comment : null;
    },

    markComplete(userId: number, lessonId: number, now: Date) {
      return markLessonComplete(database, { userId, lessonId }, now);
    },

    /**
     * Scores and records an attempt. A quiz from another lesson counts as
     * not found, so its id can't be posted to this lesson's page.
     */
    submitQuiz(
      { userId, lessonId, quizId }: QuizSubmission,
      selectedAnswers: Record<number, number>
    ) {
      const quiz = getQuizById(database, quizId);
      if (!quiz || quiz.lessonId !== lessonId) {
        return { status: "not-found" as const };
      }
      const result = computeResult(
        database,
        { userId, quizId },
        selectedAnswers
      );
      return result
        ? { status: "scored" as const, result }
        : { status: "failed" as const };
    },
  };
}

// Pure so a route importing this only for its loader doesn't pull the
// database into the client bundle (see `~/db`).
export const lessonViewer = /* @__PURE__ */ createLessonViewer(db);
