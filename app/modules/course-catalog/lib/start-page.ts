import { count, desc, eq } from "drizzle-orm";
import type { Db } from "~/db/types";
import { categories, courses, CourseStatus, users } from "~/db/schema";
import { countLessonsByCourse } from "./lesson-counts";

const FEATURED_COURSE_COUNT = 3;

export type FeaturedCourse = {
  id: number;
  title: string;
  slug: string;
  description: string;
  coverImageUrl: string | null;
  instructorName: string | null;
  lessonCount: number;
};

export type StartPage = {
  featuredCourses: FeaturedCourse[];
  totalCourses: number;
  totalCategories: number;
};

export function getStartPage(database: Db): StartPage {
  return {
    featuredCourses: newestPublishedCourses(database),
    totalCourses: countPublishedCourses(database),
    totalCategories: countCategories(database),
  };
}

function newestPublishedCourses(database: Db): FeaturedCourse[] {
  const newest = database
    .select({
      id: courses.id,
      title: courses.title,
      slug: courses.slug,
      description: courses.description,
      coverImageUrl: courses.coverImageUrl,
      instructorName: users.name,
    })
    .from(courses)
    .innerJoin(users, eq(courses.instructorId, users.id))
    .where(eq(courses.status, CourseStatus.Published))
    .orderBy(desc(courses.createdAt), desc(courses.id))
    .limit(FEATURED_COURSE_COUNT)
    .all();

  const lessonCounts = countLessonsByCourse(
    database,
    newest.map((course) => course.id)
  );
  return newest.map((course) => ({
    ...course,
    lessonCount: lessonCounts.get(course.id) ?? 0,
  }));
}

function countPublishedCourses(database: Db): number {
  const row = database
    .select({ total: count() })
    .from(courses)
    .where(eq(courses.status, CourseStatus.Published))
    .get();
  return row?.total ?? 0;
}

function countCategories(database: Db): number {
  const row = database.select({ total: count() }).from(categories).get();
  return row?.total ?? 0;
}
