import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { CourseStatus } from "~/db/schema";
import { markdown } from "~/lib/text";
import { createCourseCatalog } from "../index.server";

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let catalog: ReturnType<typeof createCourseCatalog>;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  catalog = createCourseCatalog(db);
});

// ─── Fixtures ───
// No module writes courses, modules or lessons yet (the instructor routes
// do), so rows go in directly. Kept in one place so a schema change touches
// only this block.

let slugCounter = 0;

function addCourse(
  title: string,
  createdAt: string,
  status: CourseStatus = CourseStatus.Published
) {
  slugCounter += 1;
  return db
    .insert(schema.courses)
    .values({
      title,
      slug: `course-${slugCounter}`,
      description: `${title} description`,
      salesCopy: markdown(""),
      instructorId: base.instructor.id,
      categoryId: base.category.id,
      status,
      createdAt,
    })
    .returning()
    .get();
}

function addLessons(courseId: number, perModule: number[]) {
  perModule.forEach((lessonCount, moduleIndex) => {
    const module = db
      .insert(schema.modules)
      .values({
        courseId,
        title: `Module ${moduleIndex}`,
        position: moduleIndex,
      })
      .returning()
      .get();
    for (let position = 0; position < lessonCount; position++) {
      db.insert(schema.lessons)
        .values({ moduleId: module.id, title: `Lesson ${position}`, position })
        .run();
    }
  });
}

function addCategory(name: string) {
  db.insert(schema.categories).values({ name, slug: name.toLowerCase() }).run();
}

describe("lessonCounts", () => {
  it("sums the lessons across every module of each course", () => {
    const other = addCourse("Other", "2026-01-02T00:00:00.000Z");
    addLessons(base.course.id, [2, 3]);
    addLessons(other.id, [1]);

    const counts = catalog.lessonCounts([base.course.id, other.id]);

    expect(counts.get(base.course.id)).toBe(5);
    expect(counts.get(other.id)).toBe(1);
  });

  it("maps a course with no modules or no lessons to 0", () => {
    const empty = addCourse("Empty modules", "2026-01-02T00:00:00.000Z");
    addLessons(empty.id, [0]);

    const counts = catalog.lessonCounts([base.course.id, empty.id]);

    expect(counts.get(base.course.id)).toBe(0);
    expect(counts.get(empty.id)).toBe(0);
  });

  it("returns an empty map for no course ids", () => {
    expect(catalog.lessonCounts([]).size).toBe(0);
  });

  it("leaves out courses it was not asked about", () => {
    const other = addCourse("Other", "2026-01-02T00:00:00.000Z");
    addLessons(other.id, [4]);

    const counts = catalog.lessonCounts([base.course.id]);

    expect([...counts.keys()]).toEqual([base.course.id]);
  });
});

describe("startPage", () => {
  it("features the three newest published courses, newest first, with lesson counts", () => {
    db.update(schema.courses)
      .set({ createdAt: "2025-06-01T00:00:00.000Z" })
      .run();
    addCourse("Oldest", "2020-01-01T00:00:00.000Z");
    const middle = addCourse("Middle", "2026-02-01T00:00:00.000Z");
    const newest = addCourse("Newest", "2026-03-01T00:00:00.000Z");
    addCourse("Draft", "2026-04-01T00:00:00.000Z", CourseStatus.Draft);
    addLessons(newest.id, [2, 1]);

    const { featuredCourses } = catalog.startPage();

    expect(featuredCourses.map((c) => c.title)).toEqual([
      "Newest",
      "Middle",
      base.course.title,
    ]);
    expect(featuredCourses[0]).toEqual({
      id: newest.id,
      title: "Newest",
      slug: newest.slug,
      description: "Newest description",
      coverImageUrl: null,
      instructorName: base.instructor.name,
      lessonCount: 3,
    });
    expect(featuredCourses[1].id).toBe(middle.id);
    expect(featuredCourses[1].lessonCount).toBe(0);
  });

  it("counts every published course, past the 50 the old loader stopped at", () => {
    for (let i = 0; i < 55; i++)
      addCourse(`Course ${i}`, "2026-01-01T00:00:00.000Z");
    addCourse("Draft", "2026-01-01T00:00:00.000Z", CourseStatus.Draft);
    addCourse("Archived", "2026-01-01T00:00:00.000Z", CourseStatus.Archived);

    expect(catalog.startPage().totalCourses).toBe(56);
  });

  it("counts every category", () => {
    addCategory("Design");
    addCategory("Data");

    expect(catalog.startPage().totalCategories).toBe(3);
  });

  it("features nothing and counts zero when no course is published", () => {
    db.update(schema.courses).set({ status: CourseStatus.Draft }).run();

    const page = catalog.startPage();

    expect(page.featuredCourses).toEqual([]);
    expect(page.totalCourses).toBe(0);
  });
});
