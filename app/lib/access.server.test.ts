import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import { setCurrentUserId } from "~/lib/session";
import {
  requirePlatformAdmin,
  requireCourseInstructor,
  requireInstructor,
  requireInstructorOrPlatformAdmin,
} from "./access.server";

// The guards read the app's database singleton. Point it at a fresh in-memory
// database per test so the guards run against real rows.
const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("~/db", () => ({
  db: new Proxy(
    {},
    {
      get(_target, prop) {
        const target = state.db as Record<PropertyKey, unknown>;
        const value = Reflect.get(target, prop);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }
  ),
}));

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let admin: typeof schema.users.$inferSelect;
let otherInstructor: typeof schema.users.$inferSelect;

beforeEach(() => {
  db = createTestDb();
  state.db = db;
  base = seedBaseData(db);

  admin = db
    .insert(schema.users)
    .values({ name: "Pat Admin", email: "pat@example.com", role: UserRole.Admin })
    .returning()
    .get();

  otherInstructor = db
    .insert(schema.users)
    .values({
      name: "Other Instructor",
      email: "other-instructor@example.com",
      role: UserRole.Instructor,
    })
    .returning()
    .get();
});

/** A request carrying a real signed session cookie for `userId`, or none when null. */
async function requestAs(userId: number | null): Promise<Request> {
  if (userId === null) return new Request("http://localhost:3000/");

  const setCookie = await setCurrentUserId(
    new Request("http://localhost:3000/"),
    userId
  );
  return new Request("http://localhost:3000/", {
    headers: { Cookie: setCookie.split(";")[0] },
  });
}

/** Resolves to the value a guard threw, failing the test if it did not throw. */
async function thrownBy(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the guard to throw");
}

function statusOf(error: unknown): number | undefined {
  return (error as { init?: { status?: number } }).init?.status;
}

describe("requirePlatformAdmin", () => {
  it("returns the admin's id and user", async () => {
    const result = await requirePlatformAdmin(await requestAs(admin.id));

    expect(result.userId).toBe(admin.id);
    expect(result.user).toMatchObject({ id: admin.id, role: UserRole.Admin });
  });

  it("rejects a signed-out visitor with 401", async () => {
    const error = await thrownBy(requirePlatformAdmin(await requestAs(null)));

    expect(statusOf(error)).toBe(401);
  });

  it("rejects an instructor with 403", async () => {
    const error = await thrownBy(
      requirePlatformAdmin(await requestAs(base.instructor.id))
    );

    expect(statusOf(error)).toBe(403);
  });

  it("rejects a student with 403", async () => {
    const error = await thrownBy(requirePlatformAdmin(await requestAs(base.user.id)));

    expect(statusOf(error)).toBe(403);
  });
});

describe("requireInstructor", () => {
  it("returns the instructor's id and user", async () => {
    const result = await requireInstructor(
      await requestAs(base.instructor.id)
    );

    expect(result.userId).toBe(base.instructor.id);
    expect(result.user).toMatchObject({
      id: base.instructor.id,
      role: UserRole.Instructor,
    });
  });

  it("rejects a signed-out visitor with 401", async () => {
    const error = await thrownBy(requireInstructor(await requestAs(null)));

    expect(statusOf(error)).toBe(401);
  });

  it("rejects a student with 403", async () => {
    const error = await thrownBy(
      requireInstructor(await requestAs(base.user.id))
    );

    expect(statusOf(error)).toBe(403);
  });

  it("rejects an admin with 403, since this gate is instructors only", async () => {
    const error = await thrownBy(requireInstructor(await requestAs(admin.id)));

    expect(statusOf(error)).toBe(403);
  });
});

describe("requireInstructorOrPlatformAdmin", () => {
  it("lets an admin through and flags them as admin", async () => {
    const result = await requireInstructorOrPlatformAdmin(await requestAs(admin.id));

    expect(result).toMatchObject({ userId: admin.id, isAdmin: true });
  });

  it("lets an instructor through without the admin flag", async () => {
    const result = await requireInstructorOrPlatformAdmin(
      await requestAs(base.instructor.id)
    );

    expect(result).toMatchObject({ userId: base.instructor.id, isAdmin: false });
  });

  it("rejects a student with 403", async () => {
    const error = await thrownBy(
      requireInstructorOrPlatformAdmin(await requestAs(base.user.id))
    );

    expect(statusOf(error)).toBe(403);
  });
});

describe("requireCourseInstructor", () => {
  it("returns the caller, the course, and isAdmin for the course's own instructor", async () => {
    const result = await requireCourseInstructor(
      await requestAs(base.instructor.id),
      base.course.id
    );

    expect(result).toMatchObject({
      userId: base.instructor.id,
      user: { id: base.instructor.id },
      course: { id: base.course.id, instructorId: base.instructor.id },
      isAdmin: false,
    });
  });

  it("lets an admin into any course and flags isAdmin", async () => {
    const result = await requireCourseInstructor(
      await requestAs(admin.id),
      base.course.id
    );

    expect(result).toMatchObject({
      userId: admin.id,
      course: { id: base.course.id },
      isAdmin: true,
    });
  });

  it("rejects a signed-out visitor with 401", async () => {
    const error = await thrownBy(
      requireCourseInstructor(await requestAs(null), base.course.id)
    );

    expect(statusOf(error)).toBe(401);
  });

  it("rejects a student with 403", async () => {
    const error = await thrownBy(
      requireCourseInstructor(await requestAs(base.user.id), base.course.id)
    );

    expect(statusOf(error)).toBe(403);
  });

  it("rejects an instructor who does not own the course with 403", async () => {
    const error = await thrownBy(
      requireCourseInstructor(await requestAs(otherInstructor.id), base.course.id)
    );

    expect(statusOf(error)).toBe(403);
  });

  it("rejects an unknown course with 404, even for an admin", async () => {
    const error = await thrownBy(
      requireCourseInstructor(await requestAs(admin.id), 999_999)
    );

    expect(statusOf(error)).toBe(404);
  });
});
