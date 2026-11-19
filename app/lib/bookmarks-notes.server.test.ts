import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import {
  getBookmark,
  getNote,
  listBookmarks,
  listNotes,
  MAX_NOTE_LENGTH,
  saveNote,
  toggleBookmark,
} from "./bookmarks-notes.server";
import { approveRefundRequest, raiseRefundRequest } from "./refunds.server";
import { fakeNotifications } from "./notifications.fake.server";

type TestDb = ReturnType<typeof createTestDb>;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonIds: number[];
let otherStudentId: number;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();
  lessonIds = [1, 2].map(
    (position) =>
      db
        .insert(schema.lessons)
        .values({ moduleId: module.id, title: `Lesson ${position}`, position })
        .returning()
        .get().id
  );
  otherStudentId = db
    .insert(schema.users)
    .values({ name: "Other", email: "other@example.com", role: UserRole.Student })
    .returning()
    .get().id;
});

describe("bookmarks", () => {
  it("toggling creates a Bookmark, toggling again removes it", () => {
    expect(toggleBookmark(db, base.user.id, lessonIds[0])).toBe(true);
    expect(getBookmark(db, base.user.id, lessonIds[0])).toBeDefined();
    expect(toggleBookmark(db, base.user.id, lessonIds[0])).toBe(false);
    expect(getBookmark(db, base.user.id, lessonIds[0])).toBeUndefined();
  });
});

describe("notes", () => {
  it("creates a Note, then re-saving replaces the body and moves 'last edited' on", () => {
    const first = new Date(2026, 0, 1);
    const second = new Date(2026, 0, 2);
    saveNote(db, base.user.id, lessonIds[0], "  first  ", first);
    saveNote(db, base.user.id, lessonIds[0], "second", second);

    const notes = db.select().from(schema.notes).all();
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toBe("second");
    expect(notes[0].createdAt).toBe(first.toISOString());
    expect(notes[0].updatedAt).toBe(second.toISOString());
  });

  it("trims the body", () => {
    saveNote(db, base.user.id, lessonIds[0], "  hi  ");
    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe("hi");
  });

  it("accepts exactly 2,000 characters and refuses 2,001", () => {
    expect(
      saveNote(db, base.user.id, lessonIds[0], "a".repeat(MAX_NOTE_LENGTH)).ok
    ).toBe(true);
    const refused = saveNote(
      db,
      base.user.id,
      lessonIds[0],
      "a".repeat(MAX_NOTE_LENGTH + 1)
    );
    expect(refused.ok).toBe(false);
    expect(getNote(db, base.user.id, lessonIds[0])?.body).toHaveLength(
      MAX_NOTE_LENGTH
    );
  });

  it("refuses a Note on a Lesson that does not exist", () => {
    expect(saveNote(db, base.user.id, 9999, "hi").ok).toBe(false);
  });
});

describe("saved lists", () => {
  it("hold only the Student's own rows, newest first, with Lesson and Course", () => {
    toggleBookmark(db, base.user.id, lessonIds[0]);
    db.update(schema.bookmarks)
      .set({ createdAt: new Date(2026, 0, 1).toISOString() })
      .run();
    toggleBookmark(db, base.user.id, lessonIds[1]);
    toggleBookmark(db, otherStudentId, lessonIds[0]);
    saveNote(db, base.user.id, lessonIds[0], "old", new Date(2026, 0, 1));
    saveNote(db, base.user.id, lessonIds[1], "new", new Date(2026, 0, 2));
    saveNote(db, otherStudentId, lessonIds[0], "theirs");

    const bookmarks = listBookmarks(db, base.user.id);
    expect(bookmarks.map((b) => b.lessonId)).toEqual([
      lessonIds[1],
      lessonIds[0],
    ]);
    expect(bookmarks[0]).toMatchObject({
      courseTitle: base.course.title,
      courseSlug: base.course.slug,
    });

    const notes = listNotes(db, base.user.id);
    expect(notes.map((n) => n.body)).toEqual(["new", "old"]);
    expect(notes[0].courseTitle).toBe(base.course.title);
  });
});

describe("approving a Refund", () => {
  it("keeps the Student's Bookmarks and Notes", async () => {
    const admin = db
      .insert(schema.users)
      .values({ name: "Pat", email: "pat@example.com", role: UserRole.Admin })
      .returning()
      .get();
    const purchase = db
      .insert(schema.purchases)
      .values({
        userId: base.user.id,
        courseId: base.course.id,
        amountPaid: 7900,
        createdAt: new Date(2026, 9, 4).toISOString(),
      })
      .returning()
      .get();
    db.insert(schema.enrollments)
      .values({ userId: base.user.id, courseId: base.course.id })
      .run();
    toggleBookmark(db, base.user.id, lessonIds[0]);
    saveNote(db, base.user.id, lessonIds[0], "keep me");

    const now = new Date(2026, 9, 6, 12);
    const notifications = fakeNotifications();
    const raised = await raiseRefundRequest(
      db,
      purchase.id,
      base.user.id,
      "Not for me.",
      now,
      notifications
    );
    if (!raised.ok) throw new Error(raised.error);
    await approveRefundRequest(
      db,
      raised.refundRequestId,
      admin.id,
      null,
      now,
      notifications
    );

    expect(getBookmark(db, base.user.id, lessonIds[0])).toBeDefined();
    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe("keep me");
  });
});
