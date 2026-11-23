import type {
  CourseDecisions,
  DenialReason,
} from "~/modules/permissions/course-permissions.server";
import { isBookmarked } from "~/lib/bookmarks.server";
import { getNote } from "~/lib/notes.server";
import { renderMarkdown } from "~/lib/markdown.server";
import {
  flattenCourseLessons,
  getCourseWithDetails,
  getLessonById,
  getModuleById,
  getUserById,
} from "./course";
import {
  calculateWatchProgress,
  getLastWatchPosition,
  getLessonProgress,
  getLessonProgressForCourse,
  markLessonInProgress,
} from "./progress";
import { getLessonThread, renderThread } from "./thread";
import {
  getBestAttempt,
  getQuizByLessonId,
  getQuizWithQuestions,
} from "./quiz";
import type { Db } from "./db";

export type FoundCourseDecisions = Extract<CourseDecisions, { found: true }>;

/**
 * Everything the lesson page shows, or null when the lesson or its module is
 * missing. Someone who can't view gets the "locked" shape.
 */
export async function loadLessonPage(
  database: Db,
  decisions: FoundCourseDecisions,
  lessonId: number
) {
  const { course, person, enrolled, view, take, manage } = decisions;
  const currentUserId = person?.id ?? null;

  const courseWithDetails = getCourseWithDetails(database, course.id);
  const lesson = getLessonById(database, lessonId);
  const mod = lesson ? getModuleById(database, lesson.moduleId) : undefined;
  if (!courseWithDetails || !lesson || !mod) return null;

  const curriculum = courseWithDetails.modules.map((m) => ({
    id: m.id,
    title: m.title,
    lessons: m.lessons.map((l) => ({
      id: l.id,
      title: l.title,
    })),
  }));

  // Someone who can't view the content gets the lesson's title, its module and
  // the course outline — never the body, video or quiz — plus the reason, so
  // the page can show the right call to action.
  if (!view.allowed) {
    const lockedReason: DenialReason = view.reason;

    return {
      view: "locked" as const,
      course: {
        id: courseWithDetails.id,
        title: courseWithDetails.title,
        slug: courseWithDetails.slug,
      },
      curriculum,
      module: { id: mod.id, title: mod.title },
      lesson: { id: lesson.id, title: lesson.title },
      enrolled,
      lockedReason,
    };
  }

  let lessonStatus: string | null = null;
  let lastWatchPosition = 0;
  let watchProgress = 0;
  const lessonProgressMap: Record<number, string> = {};

  if (currentUserId) {
    // Progress is recorded only for people who can take the course, so a
    // Student under a Country Lock gets none.
    if (take.allowed) {
      markLessonInProgress(database, currentUserId, lessonId);
      const progress = getLessonProgress(database, currentUserId, lessonId);
      lessonStatus = progress?.status ?? null;

      const progressRecords = getLessonProgressForCourse(
        database,
        currentUserId,
        course.id
      );
      for (const record of progressRecords) {
        lessonProgressMap[record.lessonId] = record.status;
      }

      if (lesson.videoUrl) {
        lastWatchPosition = getLastWatchPosition(
          database,
          currentUserId,
          lessonId
        );
        const videoDurationSeconds = (lesson.durationMinutes ?? 0) * 60;
        if (videoDurationSeconds > 0) {
          watchProgress = calculateWatchProgress(
            database,
            { userId: currentUserId, lessonId },
            videoDurationSeconds
          );
        }
      }
    }
  }

  // Everything from here on is behind the can-view-content bar above:
  // comments, Bookmarks and Notes are confidential to the course.
  const instructor = getUserById(database, course.instructorId);
  const comments = await renderThread(getLessonThread(database, lessonId));

  const bookmarked = currentUserId
    ? isBookmarked(database, currentUserId, lessonId)
    : false;
  const note = currentUserId
    ? getNote(database, currentUserId, lessonId)
    : undefined;

  const contentHtml = lesson.content
    ? await renderMarkdown(lesson.content)
    : null;

  const allLessons = flattenCourseLessons(courseWithDetails);
  const currentIndex = allLessons.findIndex((l) => l.id === lessonId);
  const prevLesson = currentIndex > 0 ? allLessons[currentIndex - 1] : null;
  const nextLesson =
    currentIndex < allLessons.length - 1 ? allLessons[currentIndex + 1] : null;

  const quizRecord = getQuizByLessonId(database, lessonId);
  let quiz: {
    id: number;
    title: string;
    passingScore: number;
    questions: Array<{
      id: number;
      questionText: string;
      questionType: string;
      position: number;
      options: Array<{ id: number; optionText: string }>;
    }>;
  } | null = null;
  let bestAttempt: { score: number; passed: boolean } | null = null;

  if (quizRecord) {
    const quizData = getQuizWithQuestions(database, quizRecord.id);
    if (quizData) {
      // Strip isCorrect from options so answers aren't leaked to the client
      quiz = {
        id: quizData.id,
        title: quizData.title,
        passingScore: quizData.passingScore,
        questions: quizData.questions.map((q) => ({
          id: q.id,
          questionText: q.questionText,
          questionType: q.questionType,
          position: q.position,
          options: q.options.map((o) => ({
            id: o.id,
            optionText: o.optionText,
          })),
        })),
      };
    }

    if (currentUserId) {
      const best = getBestAttempt(database, currentUserId, quizRecord.id);
      if (best) {
        bestAttempt = { score: best.score, passed: best.passed };
      }
    }
  }

  return {
    view: "full" as const,
    course: {
      id: courseWithDetails.id,
      title: courseWithDetails.title,
      slug: courseWithDetails.slug,
    },
    curriculum,
    module: {
      id: mod.id,
      title: mod.title,
    },
    lesson,
    contentHtml,
    lessonStatus,
    enrolled,
    currentUserId,
    prevLesson,
    nextLesson,
    quiz,
    bestAttempt,
    lastWatchPosition,
    watchProgress,
    lessonProgressMap,
    comments,
    canModerate: manage.allowed,
    instructorName: instructor?.name ?? "your instructor",
    bookmarked,
    note: note ? { body: note.body, updatedAt: note.updatedAt } : null,
  };
}
