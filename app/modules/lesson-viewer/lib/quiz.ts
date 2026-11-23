import { and, desc, eq, inArray } from "drizzle-orm";
import {
  quizzes,
  quizQuestions,
  quizOptions,
  quizAttempts,
  quizAnswers,
} from "~/db/schema";
import type { Db } from "./db";

export function getQuizById(database: Db, quizId: number) {
  return database.select().from(quizzes).where(eq(quizzes.id, quizId)).get();
}

export function getQuizByLessonId(database: Db, lessonId: number) {
  return database
    .select()
    .from(quizzes)
    .where(eq(quizzes.lessonId, lessonId))
    .get();
}

export function getQuizWithQuestions(database: Db, quizId: number) {
  const quiz = database
    .select()
    .from(quizzes)
    .where(eq(quizzes.id, quizId))
    .get();
  if (!quiz) return null;

  const questions = database
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quizId))
    .orderBy(quizQuestions.position)
    .all();

  const optionsByQuestion = getOptionsByQuestion(
    database,
    questions.map((question) => question.id)
  );
  const questionsWithOptions = questions.map((question) => ({
    ...question,
    options: optionsByQuestion.get(question.id) ?? [],
  }));

  return { ...quiz, questions: questionsWithOptions };
}

function getOptionsByQuestion(database: Db, questionIds: number[]) {
  const byQuestion = new Map<number, (typeof quizOptions.$inferSelect)[]>();
  if (questionIds.length === 0) return byQuestion;

  const options = database
    .select()
    .from(quizOptions)
    .where(inArray(quizOptions.questionId, questionIds))
    .all();
  for (const option of options) {
    const list = byQuestion.get(option.questionId) ?? [];
    list.push(option);
    byQuestion.set(option.questionId, list);
  }
  return byQuestion;
}

export function getBestAttempt(database: Db, userId: number, quizId: number) {
  return database
    .select()
    .from(quizAttempts)
    .where(
      and(eq(quizAttempts.userId, userId), eq(quizAttempts.quizId, quizId))
    )
    .orderBy(desc(quizAttempts.score))
    .limit(1)
    .get();
}

export function calculateGrade(score: number): string {
  if (score >= 0.9) return "A";
  if (score >= 0.8) return "B";
  if (score >= 0.7) return "C";
  if (score >= 0.6) return "D";
  return "F";
}

export type QuestionResult = {
  questionId: number;
  correct: boolean;
  selectedOptionId: number | null;
  correctOptionId: number | null;
};

export function computeResult(
  database: Db,
  { userId, quizId }: { userId: number; quizId: number },
  selectedAnswers: Record<number, number>
) {
  try {
    const quiz = database
      .select()
      .from(quizzes)
      .where(eq(quizzes.id, quizId))
      .get();
    if (!quiz) {
      console.error("quiz not found");
      return null;
    }

    const questions = database
      .select()
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, quizId))
      .orderBy(quizQuestions.position)
      .all();

    const optionsByQuestion = getOptionsByQuestion(
      database,
      questions.map((question) => question.id)
    );

    let correct = 0;
    const total = questions.length;
    const questionResults: QuestionResult[] = [];

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const selected = selectedAnswers[q.id];

      if (!selected) {
        questionResults.push({
          questionId: q.id,
          correct: false,
          selectedOptionId: null,
          correctOptionId: null,
        });
        continue;
      }

      const correctOptionId =
        optionsByQuestion.get(q.id)?.find((o) => o.isCorrect)?.id ?? null;

      const isCorrect = selected === correctOptionId;
      if (isCorrect) correct++;

      questionResults.push({
        questionId: q.id,
        correct: isCorrect,
        selectedOptionId: selected,
        correctOptionId,
      });
    }

    const scoreValue = total > 0 ? correct / total : 0;
    const passed = scoreValue > 0.7;
    const grade = calculateGrade(scoreValue);

    const attempt = database.transaction((tx) => {
      const inserted = tx
        .insert(quizAttempts)
        .values({ userId, quizId, score: scoreValue, passed })
        .returning()
        .get();

      const answers = questionResults.flatMap((result) =>
        result.selectedOptionId === null
          ? []
          : [
              {
                attemptId: inserted.id,
                questionId: result.questionId,
                selectedOptionId: result.selectedOptionId,
              },
            ]
      );
      if (answers.length > 0) tx.insert(quizAnswers).values(answers).run();

      return inserted;
    });

    return {
      attemptId: attempt.id,
      score: scoreValue,
      passed,
      grade,
      totalCorrect: correct,
      totalQuestions: total,
      questionResults,
    };
  } catch (error) {
    console.error(error);
    return null;
  }
}
