import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import {
  CourseStatus,
  LessonProgressStatus,
  UserRole,
} from "~/db/schema";
import { markdown } from "~/lib/text";
import {
  getAnalyticsOptions,
  getCourseReport,
  getOverview,
} from "./instructor-analytics.server";

// A fixed clock. Ranges, buckets and refund windows are all measured from it.
const NOW = new Date("2026-10-06T12:00:00.000Z");
const DAY = 86_400_000;

/** An ISO timestamp exactly `days` * 24 hours before NOW. */
function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * DAY).toISOString();
}

/**
 * An ISO timestamp `days` calendar days from NOW. Refund windows count whole
 * local days, so the refund tests step in local days too.
 */
function localDaysFromNow(days: number): string {
  const when = new Date(NOW);
  when.setDate(when.getDate() + days);
  return when.toISOString();
}

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let seq = 0;

type Purchase = typeof schema.purchases.$inferSelect;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
});

function addUser(name: string, role: UserRole = UserRole.Student) {
  seq += 1;
  return db
    .insert(schema.users)
    .values({ name, email: `user${seq}@example.com`, role })
    .returning()
    .get();
}

function addCourse(
  instructorId: number,
  title: string,
  status: CourseStatus = CourseStatus.Published
) {
  seq += 1;
  return db
    .insert(schema.courses)
    .values({
      title,
      slug: `course-${seq}`,
      description: "A course",
      salesCopy: markdown("Sales copy"),
      instructorId,
      categoryId: base.category.id,
      status,
    })
    .returning()
    .get();
}

function addPurchase(values: {
  userId: number;
  courseId: number;
  amountPaid: number;
  createdAt: string;
  country?: string | null;
}): Purchase {
  return db
    .insert(schema.purchases)
    .values({ country: null, ...values })
    .returning()
    .get();
}

/** Gives a team purchase its seats. A null entry is an unredeemed seat. */
function addSeats(purchase: Purchase, redeemedBy: (number | null)[]) {
  const team = db.insert(schema.teams).values({}).returning().get();
  for (const userId of redeemedBy) {
    seq += 1;
    db.insert(schema.coupons)
      .values({
        teamId: team.id,
        courseId: purchase.courseId,
        code: `SEAT-${seq}`,
        purchaseId: purchase.id,
        redeemedByUserId: userId,
        redeemedAt: userId === null ? null : daysAgo(1),
      })
      .run();
  }
}

function enroll(userId: number, courseId: number, enrolledAt = daysAgo(1)) {
  db.insert(schema.enrollments)
    .values({ userId, courseId, enrolledAt })
    .run();
}

function addModule(courseId: number, title: string, position: number) {
  return db
    .insert(schema.modules)
    .values({ courseId, title, position })
    .returning()
    .get();
}

function addLesson(moduleId: number, title: string, position: number) {
  return db
    .insert(schema.lessons)
    .values({ moduleId, title, position })
    .returning()
    .get();
}

function addComment(values: {
  lessonId: number;
  userId: number;
  parentId?: number | null;
  createdAt: string;
  deletedAt?: string | null;
}) {
  return db
    .insert(schema.comments)
    .values({
      body: markdown("A comment"),
      parentId: null,
      deletedAt: null,
      ...values,
    })
    .returning()
    .get();
}

const WINDOW_30D = { instructorId: null, range: "30d" } as const;

describe("getOverview", () => {
  describe("range boundary", () => {
    it("counts a purchase exactly at the cutoff, and not one a millisecond earlier", () => {
      const student = addUser("Ada");
      const cutoff = new Date(NOW.getTime() - 7 * DAY).toISOString();
      const justBefore = new Date(NOW.getTime() - 7 * DAY - 1).toISOString();
      addPurchase({ userId: student.id, courseId: base.course.id, amountPaid: 1000, createdAt: cutoff });
      addPurchase({ userId: student.id, courseId: base.course.id, amountPaid: 5000, createdAt: justBefore });

      const overview = getOverview(
        db,
        { instructorId: base.instructor.id, range: "7d" },
        NOW
      );

      expect(overview.summary).toMatchObject({ grossCents: 1000, purchaseCount: 1 });
    });
  });

  describe("summary", () => {
    it("splits gross into the platform fee and the instructor's net", () => {
      const student = addUser("Ada");
      addPurchase({ userId: student.id, courseId: base.course.id, amountPaid: 10000, createdAt: daysAgo(1) });
      addPurchase({ userId: student.id, courseId: base.course.id, amountPaid: 3333, createdAt: daysAgo(2) });
      addPurchase({ userId: student.id, courseId: base.course.id, amountPaid: 99999, createdAt: daysAgo(40) });

      const { summary } = getOverview(
        db,
        { instructorId: base.instructor.id, range: "30d" },
        NOW
      );

      expect(summary).toEqual({
        grossCents: 13333,
        feeCents: 2667,
        netCents: 10666,
        purchaseCount: 2,
      });
    });
  });

  describe("revenue over time", () => {
    it("zero-fills every day of a fixed range, including its first day", () => {
      const student = addUser("Ada");
      addPurchase({ userId: student.id, courseId: base.course.id, amountPaid: 5000, createdAt: daysAgo(2) });

      const { series } = getOverview(
        db,
        { instructorId: base.instructor.id, range: "7d" },
        NOW
      );

      expect(series.granularity).toBe("day");
      const buckets = series.points.map((point) => point.bucket);
      // The window opens exactly seven days back, and that day is included.
      expect(buckets[0]).toBe("2026-09-29");
      expect(buckets.at(-1)).toBe("2026-10-06");
      expect(buckets).toHaveLength(8);

      const sale = series.points.find((point) => point.bucket === "2026-10-04");
      expect(sale).toEqual({ bucket: "2026-10-04", grossCents: 5000, netCents: 4000 });
      expect(
        series.points
          .filter((point) => point.bucket !== "2026-10-04")
          .every((point) => point.grossCents === 0 && point.netCents === 0)
      ).toBe(true);
    });

    it("zero-fills months for all time, starting at the first sale", () => {
      const student = addUser("Ada");
      addPurchase({ userId: student.id, courseId: base.course.id, amountPaid: 4000, createdAt: "2026-07-15T10:00:00.000Z" });
      addPurchase({ userId: student.id, courseId: base.course.id, amountPaid: 6000, createdAt: "2026-09-02T10:00:00.000Z" });

      const { series } = getOverview(
        db,
        { instructorId: base.instructor.id, range: "all" },
        NOW
      );

      expect(series.granularity).toBe("month");
      expect(series.points.map((point) => point.bucket)).toEqual([
        "2026-07",
        "2026-08",
        "2026-09",
        "2026-10",
      ]);
      expect(series.points.map((point) => point.grossCents)).toEqual([4000, 0, 6000, 0]);
    });

    it("has no points for all time when nothing has sold", () => {
      const { series } = getOverview(
        db,
        { instructorId: base.instructor.id, range: "all" },
        NOW
      );

      expect(series).toEqual({ granularity: "month", points: [] });
    });
  });

  describe("team purchases", () => {
    it("splits a team purchase evenly across its redeemed seats", () => {
      const buyer = addUser("Buyer");
      const seatA = addUser("Seat A");
      const seatB = addUser("Seat B");
      const direct = addUser("Direct");

      const team = addPurchase({ userId: buyer.id, courseId: base.course.id, amountPaid: 9000, createdAt: daysAgo(3) });
      addSeats(team, [seatA.id, seatB.id, null]);
      addPurchase({ userId: direct.id, courseId: base.course.id, amountPaid: 5000, createdAt: daysAgo(2) });
      enroll(seatA.id, base.course.id);
      enroll(seatB.id, base.course.id);
      enroll(direct.id, base.course.id);

      const { audience } = getOverview(
        db,
        { instructorId: base.instructor.id, range: "30d" },
        NOW
      );

      // The buyer pays once but is not a student; the 9000 is shared by the
      // two redeemed seats, and the direct buyer is a student in full.
      expect(audience).toEqual({
        buyerCount: 2,
        studentCount: 3,
        revenuePerStudentCents: 3667,
      });
    });
  });

  describe("top buyers", () => {
    it("ranks by spend, counting seats without multiplying spend", () => {
      const buyer = addUser("Buyer");
      const seatA = addUser("Seat A");
      const cathy = addUser("Cathy");

      const team = addPurchase({ userId: buyer.id, courseId: base.course.id, amountPaid: 9000, createdAt: daysAgo(3) });
      addSeats(team, [seatA.id, null, null]);
      enroll(buyer.id, base.course.id);
      addPurchase({ userId: cathy.id, courseId: base.course.id, amountPaid: 2000, createdAt: daysAgo(2) });

      const { buyers } = getOverview(
        db,
        { instructorId: base.instructor.id, range: "30d" },
        NOW
      );

      expect(buyers).toEqual([
        expect.objectContaining({
          name: "Buyer",
          spendCents: 9000,
          purchaseCount: 1,
          seatsBought: 3,
          seatsUnredeemed: 2,
          enrolled: true,
        }),
        expect.objectContaining({
          name: "Cathy",
          spendCents: 2000,
          seatsBought: 0,
          seatsUnredeemed: 0,
          enrolled: false,
        }),
      ]);
    });
  });

  describe("refund exposure", () => {
    it("counts a purchase through the last day of its window, and not the day after", () => {
      const student = addUser("Ada");
      const second = addCourse(base.instructor.id, "Second Course");

      // Window closes today: 14 days after purchase.
      addPurchase({ userId: student.id, courseId: base.course.id, amountPaid: 1000, createdAt: localDaysFromNow(-14) });
      // Window closed yesterday.
      addPurchase({ userId: student.id, courseId: base.course.id, amountPaid: 5000, createdAt: localDaysFromNow(-15) });
      // Window closes in four days.
      addPurchase({ userId: student.id, courseId: base.course.id, amountPaid: 2000, createdAt: localDaysFromNow(-10) });
      // Window closes in thirteen days.
      addPurchase({ userId: student.id, courseId: second.id, amountPaid: 4000, createdAt: localDaysFromNow(-1) });

      const { refundExposure, summary } = getOverview(
        db,
        { instructorId: base.instructor.id, range: "all" },
        NOW
      );

      expect(summary.grossCents).toBe(12000);
      expect(refundExposure).toEqual({
        grossCents: 7000,
        netCents: 5600,
        purchaseCount: 3,
        sharePercent: 58,
        closingTodayCount: 1,
        courses: [
          {
            courseId: second.id,
            title: "Second Course",
            grossCents: 4000,
            purchaseCount: 1,
            daysLeft: 13,
          },
          {
            // The course's headline is its most urgent purchase, not its newest.
            courseId: base.course.id,
            title: base.course.title,
            grossCents: 3000,
            purchaseCount: 2,
            daysLeft: 0,
          },
        ],
      });
    });
  });

  describe("unanswered questions", () => {
    it("counts only top-level, live, student questions with no staff reply", () => {
      const student = addUser("Ada");
      const otherStudent = addUser("Ben");
      const admin = addUser("Pat Admin", UserRole.Admin);
      const instructor = base.instructor;

      const moduleRow = addModule(base.course.id, "Basics", 1);
      const lesson = addLesson(moduleRow.id, "Lesson 1", 1);

      // In range, unanswered: the one that counts.
      addComment({ lessonId: lesson.id, userId: student.id, createdAt: daysAgo(2) });
      // Old and unanswered: reported as "older".
      addComment({ lessonId: lesson.id, userId: otherStudent.id, createdAt: daysAgo(60) });
      // Deleted.
      addComment({ lessonId: lesson.id, userId: student.id, createdAt: daysAgo(2), deletedAt: daysAgo(1) });
      // Asked by the instructor, and by an admin.
      addComment({ lessonId: lesson.id, userId: instructor.id, createdAt: daysAgo(2) });
      addComment({ lessonId: lesson.id, userId: admin.id, createdAt: daysAgo(2) });
      // Answered by the instructor.
      const answered = addComment({ lessonId: lesson.id, userId: otherStudent.id, createdAt: daysAgo(3) });
      addComment({ lessonId: lesson.id, userId: instructor.id, parentId: answered.id, createdAt: daysAgo(2) });
      // Replied to only by a student: still unanswered, and in range.
      const peer = addComment({ lessonId: lesson.id, userId: student.id, createdAt: daysAgo(3) });
      addComment({ lessonId: lesson.id, userId: otherStudent.id, parentId: peer.id, createdAt: daysAgo(2) });

      const scope = { instructorId: instructor.id, range: "30d" } as const;

      expect(getOverview(db, scope, NOW).questions).toEqual({ inRange: 2, older: 1 });
      expect(
        getOverview(db, { ...scope, range: "all" }, NOW).questions
      ).toEqual({ inRange: 3, older: 0 });
    });
  });

  describe("scoping", () => {
    it("limits figures to one instructor, and sums every instructor for null", () => {
      const student = addUser("Ada");
      const otherInstructor = addUser("Other Instructor", UserRole.Instructor);
      const otherCourse = addCourse(otherInstructor.id, "Other Course");

      addPurchase({ userId: student.id, courseId: base.course.id, amountPaid: 5000, createdAt: daysAgo(1) });
      addPurchase({ userId: student.id, courseId: otherCourse.id, amountPaid: 7000, createdAt: daysAgo(1) });

      expect(
        getOverview(db, { instructorId: base.instructor.id, range: "30d" }, NOW).summary.grossCents
      ).toBe(5000);
      expect(
        getOverview(db, { instructorId: null, range: "30d" }, NOW).summary.grossCents
      ).toBe(12000);
    });

    it("flags an instructor with no published course, and never the platform view", () => {
      const drafter = addUser("Drafter", UserRole.Instructor);
      addCourse(drafter.id, "Not Yet", CourseStatus.Draft);

      expect(
        getOverview(db, { instructorId: drafter.id, range: "30d" }, NOW).unpublished
      ).toBe(true);
      expect(
        getOverview(db, { instructorId: base.instructor.id, range: "30d" }, NOW).unpublished
      ).toBe(false);
      expect(getOverview(db, WINDOW_30D, NOW).unpublished).toBe(false);
    });

    it("averages ratings to one decimal, for the instructor's courses only", () => {
      const other = addCourse(addUser("Other", UserRole.Instructor).id, "Other");
      const raters = [addUser("R1"), addUser("R2"), addUser("R3")];
      [5, 4, 4].forEach((rating, index) => {
        db.insert(schema.courseRatings)
          .values({ userId: raters[index].id, courseId: base.course.id, rating, createdAt: daysAgo(1) })
          .run();
      });
      db.insert(schema.courseRatings)
        .values({ userId: raters[0].id, courseId: other.id, rating: 1, createdAt: daysAgo(1) })
        .run();

      const { ratings } = getOverview(
        db,
        { instructorId: base.instructor.id, range: "30d" },
        NOW
      );

      expect(ratings).toEqual({ average: 4.3, count: 3 });
    });
  });

  describe("empty states", () => {
    it("reports zeros and a zero-filled window for an instructor with nothing yet", () => {
      const fresh = addUser("Fresh", UserRole.Instructor);

      const overview = getOverview(db, { instructorId: fresh.id, range: "30d" }, NOW);

      expect(overview.summary).toEqual({ grossCents: 0, feeCents: 0, netCents: 0, purchaseCount: 0 });
      expect(overview.series.points).toHaveLength(31);
      expect(overview.series.points.every((point) => point.grossCents === 0)).toBe(true);
      expect(overview.buyers).toEqual([]);
      expect(overview.ratings).toEqual({ average: null, count: 0 });
      expect(overview.audience).toEqual({ buyerCount: 0, studentCount: 0, revenuePerStudentCents: null });
      expect(overview.courses).toEqual([]);
      expect(overview.questions).toEqual({ inRange: 0, older: 0 });
      expect(overview.refundExposure).toMatchObject({
        grossCents: 0,
        purchaseCount: 0,
        sharePercent: 0,
        closingTodayCount: 0,
        courses: [],
      });
      expect(overview.unpublished).toBe(true);
    });
  });
});

describe("getCourseReport", () => {
  // Two modules, three lessons. Lesson 2 carries a quiz.
  let lesson1: { id: number };
  let lesson2: { id: number };
  let lesson3: { id: number };
  let quizId: number;

  beforeEach(() => {
    const basics = addModule(base.course.id, "Basics", 1);
    const advanced = addModule(base.course.id, "Advanced", 2);
    lesson1 = addLesson(basics.id, "Lesson 1", 1);
    lesson2 = addLesson(basics.id, "Lesson 2", 2);
    lesson3 = addLesson(advanced.id, "Lesson 3", 1);
    quizId = db
      .insert(schema.quizzes)
      .values({ lessonId: lesson2.id, title: "Quiz on Lesson 2", passingScore: 0.7 })
      .returning()
      .get().id;
  });

  function progress(userId: number, lessonId: number, status: LessonProgressStatus) {
    db.insert(schema.lessonProgress).values({ userId, lessonId, status }).run();
  }

  it("counts reach only from enrolled students, and reports the drop at each step", () => {
    const [s1, s2, s3, outsider] = [addUser("S1"), addUser("S2"), addUser("S3"), addUser("Outsider")];
    [s1, s2, s3].forEach((student) => enroll(student.id, base.course.id));

    // s1 gets furthest, into Lesson 3. s2 stops at Lesson 1. s3 never starts.
    progress(s1.id, lesson1.id, LessonProgressStatus.Completed);
    progress(s1.id, lesson2.id, LessonProgressStatus.InProgress);
    progress(s1.id, lesson3.id, LessonProgressStatus.InProgress);
    progress(s2.id, lesson1.id, LessonProgressStatus.Completed);
    // Not enrolled, so must not inflate the bars.
    progress(outsider.id, lesson2.id, LessonProgressStatus.InProgress);

    const { funnel } = getCourseReport(db, base.course.id, "all", NOW);

    expect(funnel.enrolledCount).toBe(3);
    expect(funnel.modules).toEqual([
      {
        moduleId: expect.any(Number),
        title: "Basics",
        reachedCount: 2,
        dropWithin: 1,
        lessons: [
          { lessonId: lesson1.id, title: "Lesson 1", reachedCount: 2, dropFromPrevious: 1 },
          { lessonId: lesson2.id, title: "Lesson 2", reachedCount: 1, dropFromPrevious: 1 },
        ],
      },
      {
        moduleId: expect.any(Number),
        title: "Advanced",
        reachedCount: 1,
        dropWithin: 0,
        lessons: [
          { lessonId: lesson3.id, title: "Lesson 3", reachedCount: 1, dropFromPrevious: 0 },
        ],
      },
    ]);
  });

  it("summarises progress across all enrolled students", () => {
    const [s1, s2, s3] = [addUser("S1"), addUser("S2"), addUser("S3")];
    [s1, s2, s3].forEach((student) => enroll(student.id, base.course.id));
    progress(s1.id, lesson1.id, LessonProgressStatus.Completed);
    progress(s2.id, lesson1.id, LessonProgressStatus.Completed);

    const { progress: summary } = getCourseReport(db, base.course.id, "30d", NOW);

    expect(summary).toEqual({
      enrolledCount: 3,
      totalLessons: 3,
      averageProgressPercent: 22,
      finishedCount: 0,
    });
  });

  it("takes the best attempt per student, and honours the range", () => {
    const [s1, s2, outsider] = [addUser("S1"), addUser("S2"), addUser("Old Attempt")];
    enroll(s1.id, base.course.id);
    enroll(s2.id, base.course.id);
    const attempt = (userId: number, score: number, passed: boolean, attemptedAt: string) =>
      db.insert(schema.quizAttempts)
        .values({ userId, quizId, score, passed, attemptedAt })
        .run();

    // s1 failed first, then passed: the best attempt is the one that counts.
    attempt(s1.id, 0.5, false, daysAgo(3));
    attempt(s1.id, 0.8, true, daysAgo(2));
    attempt(s2.id, 0.6, false, daysAgo(1));
    // Forty days ago: outside 30d, inside all time.
    attempt(outsider.id, 0.9, true, daysAgo(40));

    const within30 = getCourseReport(db, base.course.id, "30d", NOW).quizzes;
    expect(within30).toEqual([
      {
        quizId,
        title: "Quiz on Lesson 2",
        moduleTitle: "Basics",
        lessonTitle: "Lesson 2",
        passingScorePercent: 70,
        studentCount: 2,
        passedCount: 1,
        passRatePercent: 50,
        averageBestScorePercent: 70,
      },
    ]);

    const allTime = getCourseReport(db, base.course.id, "all", NOW).quizzes;
    expect(allTime[0]).toMatchObject({
      studentCount: 3,
      passedCount: 2,
      passRatePercent: 67,
      averageBestScorePercent: 77,
    });
  });

  it("breaks revenue down by country, with the discounted share", () => {
    const student = addUser("Ada");
    addPurchase({ userId: student.id, courseId: base.course.id, amountPaid: 10000, country: "IN", createdAt: daysAgo(1) });
    addPurchase({ userId: student.id, courseId: base.course.id, amountPaid: 5000, country: "US", createdAt: daysAgo(2) });
    addPurchase({ userId: student.id, courseId: base.course.id, amountPaid: 3000, country: null, createdAt: daysAgo(3) });
    addPurchase({ userId: student.id, courseId: base.course.id, amountPaid: 2000, country: "IN", createdAt: daysAgo(40) });

    const { countries } = getCourseReport(db, base.course.id, "30d", NOW);

    expect(countries).toMatchObject({
      grossCents: 18000,
      netCents: 14400,
      purchaseCount: 3,
      // Only India is discounted, so only its gross counts as discounted.
      discountedGrossCents: 10000,
      discountedNetCents: 8000,
      discountedSharePercent: 56,
    });
    expect(
      countries.rows.map((row) => [row.country, row.sharePercent, row.discountPercent])
    ).toEqual([
      ["IN", 56, 50],
      ["US", 28, 0],
      [null, 17, null],
    ]);
  });

  it("reports empty states for a course nobody has bought or started", () => {
    const empty = addCourse(base.instructor.id, "Empty Course");
    const module = addModule(empty.id, "Intro", 1);
    addLesson(module.id, "Hello", 1);

    const report = getCourseReport(db, empty.id, "30d", NOW);

    expect(report.progress).toEqual({
      enrolledCount: 0,
      totalLessons: 1,
      averageProgressPercent: null,
      finishedCount: 0,
    });
    expect(report.funnel.enrolledCount).toBe(0);
    expect(report.funnel.modules[0]).toMatchObject({ reachedCount: 0, dropWithin: 0 });
    expect(report.quizzes).toEqual([]);
    expect(report.countries).toMatchObject({ grossCents: 0, purchaseCount: 0, rows: [] });
  });
});

describe("getAnalyticsOptions", () => {
  it("lists every owned course, drafts included, and instructors only when asked", () => {
    const other = addUser("Other Instructor", UserRole.Instructor);
    addCourse(base.instructor.id, "Zebra Draft", CourseStatus.Draft);
    addCourse(other.id, "Elsewhere");

    const forInstructor = getAnalyticsOptions(db, base.instructor.id, {
      includeInstructors: false,
    });
    expect(forInstructor.courseOptions.map((course) => course.title)).toEqual([
      "Test Course",
      "Zebra Draft",
    ]);
    expect(forInstructor.instructors).toEqual([]);

    const platform = getAnalyticsOptions(db, null, { includeInstructors: true });
    expect(platform.courseOptions.map((course) => course.title)).toEqual([
      "Elsewhere",
      "Test Course",
      "Zebra Draft",
    ]);
    expect(platform.instructors.map((person) => person.name)).toEqual([
      "Other Instructor",
      "Test Instructor",
    ]);
  });
});
