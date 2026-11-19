import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { and, desc, eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import { bookmarks, courses, lessons, modules, notes } from "~/db/schema";

// ─── Bookmarks and Notes ───
// A Student's own flag and own writing on a Lesson. A Note is private to the
// Student who wrote it: nothing here reads another Student's Note body, and no
// Instructor or Platform Admin view may. See GLOSSARY.md.
//
// Every function takes the database first, so tests can hand in an in-memory one.

export type Db = BetterSQLite3Database<typeof schema>;

export const MAX_NOTE_LENGTH = 2000;

export type SaveNoteResult =
  | { ok: true; note: typeof notes.$inferSelect | null }
  | { ok: false; error: string };

function lessonExists(db: Db, lessonId: number) {
  return !!db
    .select({ id: lessons.id })
    .from(lessons)
    .where(eq(lessons.id, lessonId))
    .get();
}

export function getBookmark(db: Db, userId: number, lessonId: number) {
  return db
    .select()
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, userId), eq(bookmarks.lessonId, lessonId)))
    .get();
}

/** Adds the Bookmark if absent, removes it if present. Returns whether the Lesson is now bookmarked. */
export function toggleBookmark(db: Db, userId: number, lessonId: number) {
  const existing = getBookmark(db, userId, lessonId);

  if (existing) {
    db.delete(bookmarks).where(eq(bookmarks.id, existing.id)).run();
    return false;
  }

  db.insert(bookmarks)
    .values({ userId, lessonId })
    .onConflictDoNothing()
    .run();
  return true;
}

export function getNote(db: Db, userId: number, lessonId: number) {
  return db
    .select()
    .from(notes)
    .where(and(eq(notes.userId, userId), eq(notes.lessonId, lessonId)))
    .get();
}

/**
 * Creates the Note, or replaces its body and moves "last edited" on. The body
 * is trimmed and refused (not truncated) above MAX_NOTE_LENGTH. An empty body
 * is refused too: a Note always says something.
 */
export function saveNote(
  db: Db,
  userId: number,
  lessonId: number,
  rawBody: string,
  now: Date = new Date()
): SaveNoteResult {
  const body = rawBody.trim();
  if (body.length === 0) {
    return { ok: false, error: "Write something before saving." };
  }
  if (body.length > MAX_NOTE_LENGTH) {
    return {
      ok: false,
      error: `A note can be at most ${MAX_NOTE_LENGTH} characters.`,
    };
  }
  if (!lessonExists(db, lessonId)) {
    return { ok: false, error: "Lesson not found." };
  }

  const stamp = now.toISOString();
  const note = db
    .insert(notes)
    .values({ userId, lessonId, body, createdAt: stamp, updatedAt: stamp })
    .onConflictDoUpdate({
      target: [notes.userId, notes.lessonId],
      set: { body, updatedAt: stamp },
    })
    .returning()
    .get();

  return { ok: true, note };
}

/** The Student's own Bookmarks, newest first, each with its Lesson and Course. */
export function listBookmarks(db: Db, userId: number) {
  return db
    .select({
      id: bookmarks.id,
      createdAt: bookmarks.createdAt,
      lessonId: lessons.id,
      lessonTitle: lessons.title,
      moduleTitle: modules.title,
      courseTitle: courses.title,
      courseSlug: courses.slug,
    })
    .from(bookmarks)
    .innerJoin(lessons, eq(bookmarks.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(bookmarks.userId, userId))
    .orderBy(desc(bookmarks.createdAt), desc(bookmarks.id))
    .all();
}

/** The Student's own Notes, last edited first, each with its Lesson and Course. */
export function listNotes(db: Db, userId: number) {
  return db
    .select({
      id: notes.id,
      body: notes.body,
      updatedAt: notes.updatedAt,
      lessonId: lessons.id,
      lessonTitle: lessons.title,
      moduleTitle: modules.title,
      courseTitle: courses.title,
      courseSlug: courses.slug,
    })
    .from(notes)
    .innerJoin(lessons, eq(notes.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(notes.userId, userId))
    .orderBy(desc(notes.updatedAt), desc(notes.id))
    .all();
}
