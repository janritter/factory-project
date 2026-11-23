import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { LessonProgressStatus, QuestionType } from "~/db/schema";
import { markdown } from "~/lib/text";
import { saveNote } from "~/lib/notes.server";
import { toggleBookmark } from "~/lib/bookmarks.server";
import type { Decision } from "~/modules/permissions/course-permissions.server";
import { createLessonViewer, type FoundCourseDecisions } from "../index.server";

const NOW = new Date("2026-11-23T12:00:00.000Z");
const ALLOWED: Decision = { allowed: true };

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let viewer: ReturnType<typeof createLessonViewer>;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  viewer = createLessonViewer(db);
});

// ─── Fixtures ───
// No service writes modules, lessons, quizzes or comments yet, so rows go in
// directly. Kept in one place so a schema change touches only this block.

function addModule(position = 1) {
  return db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: `Module ${position}`, position })
    .returning()
    .get();
}

function addLesson(moduleId: number, position: number) {
  return db
    .insert(schema.lessons)
    .values({
      moduleId,
      title: `Lesson ${position}`,
      content: markdown(`# Lesson ${position}`),
      position,
    })
    .returning()
    .get();
}

function addQuiz(lessonId: number) {
  const quiz = db
    .insert(schema.quizzes)
    .values({ lessonId, title: "Check", passingScore: 0.7 })
    .returning()
    .get();
  const question = db
    .insert(schema.quizQuestions)
    .values({
      quizId: quiz.id,
      questionText: "Is it?",
      questionType: QuestionType.TrueFalse,
      position: 1,
    })
    .returning()
    .get();
  const [right, wrong] = [true, false].map((isCorrect) =>
    db
      .insert(schema.quizOptions)
      .values({
        questionId: question.id,
        optionText: String(isCorrect),
        isCorrect,
      })
      .returning()
      .get()
  );
  return { quiz, question, right, wrong };
}

function addComment(lessonId: number) {
  return db
    .insert(schema.comments)
    .values({ lessonId, userId: base.user.id, body: markdown("Why?") })
    .returning()
    .get();
}

function enrolledStudent(): FoundCourseDecisions {
  return {
    found: true,
    course: base.course,
    person: { id: base.user.id, role: "student", country: null },
    enrolled: true,
    view: ALLOWED,
    take: ALLOWED,
    manage: {
      allowed: false,
      reason: { kind: "not-owning-instructor-or-platform-admin" },
    },
  };
}

function signedOut(): FoundCourseDecisions {
  const denied: Decision = { allowed: false, reason: { kind: "signed-out" } };
  return {
    found: true,
    course: base.course,
    person: null,
    enrolled: false,
    view: denied,
    take: denied,
    manage: denied,
  };
}

// ─── load ───

describe("load", () => {
  it("returns null for a lesson that does not exist", async () => {
    addModule();
    expect(await viewer.load(enrolledStudent(), 999)).toBeNull();
  });

  it("gives someone who can't view only the outline and the reason", async () => {
    const mod = addModule();
    const lesson = addLesson(mod.id, 1);

    const page = await viewer.load(signedOut(), lesson.id);

    expect(page).toMatchObject({
      view: "locked",
      lesson: { id: lesson.id, title: "Lesson 1" },
      lockedReason: { kind: "signed-out" },
    });
    expect(page).not.toHaveProperty("contentHtml");
  });

  it("shows an enrolled Student the full lesson and marks it in progress", async () => {
    const mod = addModule();
    const first = addLesson(mod.id, 1);
    const second = addLesson(mod.id, 2);
    const third = addLesson(mod.id, 3);

    const page = await viewer.load(enrolledStudent(), second.id);
    if (page?.view !== "full") throw new Error("expected the full lesson");

    expect(page.contentHtml).toContain("Lesson 2");
    expect(page.prevLesson?.id).toBe(first.id);
    expect(page.nextLesson?.id).toBe(third.id);
    expect(page.lessonStatus).toBe(LessonProgressStatus.InProgress);
    expect(page.lessonProgressMap).toEqual({
      [second.id]: LessonProgressStatus.InProgress,
    });
  });

  it("includes the Student's Note and Bookmark", async () => {
    const lesson = addLesson(addModule().id, 1);
    saveNote(db, base.user.id, lesson.id, "Remember this", NOW);
    toggleBookmark(db, base.user.id, lesson.id, NOW);

    const page = await viewer.load(enrolledStudent(), lesson.id);
    if (page?.view !== "full") throw new Error("expected the full lesson");

    expect(page.note).toEqual({
      body: "Remember this",
      updatedAt: NOW.toISOString(),
    });
    expect(page.bookmarked).toBe(true);
  });

  it("sends the quiz without saying which option is correct", async () => {
    const lesson = addLesson(addModule().id, 1);
    addQuiz(lesson.id);

    const page = await viewer.load(enrolledStudent(), lesson.id);
    if (page?.view !== "full") throw new Error("expected the full lesson");

    const options = page.quiz?.questions[0].options ?? [];
    expect(options).toHaveLength(2);
    for (const option of options) {
      expect(option).not.toHaveProperty("isCorrect");
    }
  });
});

// ─── actions ───

describe("findComment", () => {
  it("finds a comment only through its own lesson", () => {
    const mod = addModule();
    const lesson = addLesson(mod.id, 1);
    const other = addLesson(mod.id, 2);
    const comment = addComment(lesson.id);

    expect(viewer.findComment(lesson.id, comment.id)?.id).toBe(comment.id);
    expect(viewer.findComment(other.id, comment.id)).toBeNull();
  });
});

describe("markComplete", () => {
  it("completes the lesson at the given time", () => {
    const lesson = addLesson(addModule().id, 1);

    const progress = viewer.markComplete(base.user.id, lesson.id, NOW);

    expect(progress.status).toBe(LessonProgressStatus.Completed);
    expect(progress.completedAt).toBe(NOW.toISOString());
  });
});

describe("submitQuiz", () => {
  it("scores a right answer as a pass", () => {
    const lesson = addLesson(addModule().id, 1);
    const { quiz, question, right } = addQuiz(lesson.id);

    const submitted = viewer.submitQuiz(
      { userId: base.user.id, lessonId: lesson.id, quizId: quiz.id },
      { [question.id]: right.id }
    );

    expect(submitted).toMatchObject({
      status: "scored",
      result: { score: 1, passed: true, grade: "A", totalCorrect: 1 },
    });
  });

  it("scores a wrong answer as a fail", () => {
    const lesson = addLesson(addModule().id, 1);
    const { quiz, question, wrong } = addQuiz(lesson.id);

    const submitted = viewer.submitQuiz(
      { userId: base.user.id, lessonId: lesson.id, quizId: quiz.id },
      { [question.id]: wrong.id }
    );

    expect(submitted).toMatchObject({
      status: "scored",
      result: { score: 0, passed: false, grade: "F" },
    });
  });

  it("records the attempt with the chosen answer", () => {
    const lesson = addLesson(addModule().id, 1);
    const { quiz, question, wrong } = addQuiz(lesson.id);

    const submitted = viewer.submitQuiz(
      { userId: base.user.id, lessonId: lesson.id, quizId: quiz.id },
      { [question.id]: wrong.id }
    );
    if (submitted.status !== "scored") throw new Error("expected a score");

    const answers = db.select().from(schema.quizAnswers).all();
    expect(answers).toEqual([
      expect.objectContaining({
        attemptId: submitted.result.attemptId,
        questionId: question.id,
        selectedOptionId: wrong.id,
      }),
    ]);
  });

  it("refuses a quiz from another lesson", () => {
    const mod = addModule();
    const lesson = addLesson(mod.id, 1);
    const other = addLesson(mod.id, 2);
    const { quiz } = addQuiz(other.id);

    const submitted = viewer.submitQuiz(
      { userId: base.user.id, lessonId: lesson.id, quizId: quiz.id },
      {}
    );

    expect(submitted).toEqual({ status: "not-found" });
  });
});
