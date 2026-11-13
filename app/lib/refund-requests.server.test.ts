import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import {
  approveRefundRequest,
  declineRefundRequest,
  buildRefundDecisionEmail,
} from "./refund-requests.server";
import { getRefundRules } from "./refund-eligibility.server";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;
let staff: typeof schema.users.$inferSelect;
let otherStaff: typeof schema.users.$inferSelect;

function addAdmin(email: string) {
  return testDb
    .insert(schema.users)
    .values({ name: email, email, role: schema.UserRole.Admin })
    .returning()
    .get();
}

function openRequest(amountPaid = 7900) {
  const purchase = testDb
    .insert(schema.purchases)
    .values({
      userId: base.user.id,
      courseId: base.course.id,
      amountPaid,
    })
    .returning()
    .get();
  testDb
    .insert(schema.enrollments)
    .values({ userId: base.user.id, courseId: base.course.id })
    .run();
  const request = testDb
    .insert(schema.refundRequests)
    .values({ purchaseId: purchase.id, reason: "Bought the wrong course." })
    .returning()
    .get();
  return { purchase, request };
}

function getRequest(id: number) {
  return testDb
    .select()
    .from(schema.refundRequests)
    .where(eq(schema.refundRequests.id, id))
    .get()!;
}

function enrolled() {
  return testDb.select().from(schema.enrollments).all().length === 1;
}

beforeEach(() => {
  testDb = createTestDb();
  base = seedBaseData(testDb);
  staff = addAdmin("staff1@example.com");
  otherStaff = addAdmin("staff2@example.com");
});

describe("approveRefundRequest", () => {
  it("approves, creates a Pending Refund for the full amount, and revokes access", () => {
    const { request } = openRequest(4200);

    const result = approveRefundRequest(testDb, {
      refundRequestId: request.id,
      staffUserId: staff.id,
    });

    expect(result).toEqual({ ok: true, refundRequestId: request.id });
    const decided = getRequest(request.id);
    expect(decided.status).toBe(schema.RefundRequestStatus.Approved);
    expect(decided.resolvedByUserId).toBe(staff.id);
    expect(decided.resolvedAt).not.toBeNull();

    const refund = testDb.select().from(schema.refunds).all();
    expect(refund).toHaveLength(1);
    expect(refund[0]).toMatchObject({
      refundRequestId: request.id,
      amount: 4200,
      status: schema.RefundStatus.Pending,
    });
    expect(enrolled()).toBe(false);
  });

  it("first decision wins: a second approval changes nothing", () => {
    const { request } = openRequest();
    approveRefundRequest(testDb, {
      refundRequestId: request.id,
      staffUserId: staff.id,
    });

    const second = approveRefundRequest(testDb, {
      refundRequestId: request.id,
      staffUserId: otherStaff.id,
    });

    expect(second).toEqual({ ok: false, reason: "already-decided" });
    expect(getRequest(request.id).resolvedByUserId).toBe(staff.id);
    expect(testDb.select().from(schema.refunds).all()).toHaveLength(1);
  });

  it("cannot approve a request that was declined", () => {
    const { request } = openRequest();
    declineRefundRequest(testDb, {
      refundRequestId: request.id,
      staffUserId: staff.id,
      declineReason: "You watched most of the course.",
    });

    const result = approveRefundRequest(testDb, {
      refundRequestId: request.id,
      staffUserId: otherStaff.id,
    });

    expect(result).toEqual({ ok: false, reason: "already-decided" });
    expect(testDb.select().from(schema.refunds).all()).toHaveLength(0);
    expect(enrolled()).toBe(true);
  });

  it("reports an unknown request as not found", () => {
    expect(
      approveRefundRequest(testDb, {
        refundRequestId: 999,
        staffUserId: staff.id,
      })
    ).toEqual({ ok: false, reason: "not-found" });
  });
});

describe("declineRefundRequest", () => {
  it("declines with a Decline Reason, creates no Refund, keeps access", () => {
    const { request } = openRequest();

    const result = declineRefundRequest(testDb, {
      refundRequestId: request.id,
      staffUserId: staff.id,
      declineReason: "You are outside the usual rules.",
    });

    expect(result.ok).toBe(true);
    expect(getRequest(request.id)).toMatchObject({
      status: schema.RefundRequestStatus.Declined,
      declineReason: "You are outside the usual rules.",
      resolvedByUserId: staff.id,
    });
    expect(testDb.select().from(schema.refunds).all()).toHaveLength(0);
    expect(enrolled()).toBe(true);
  });

  it("first decision wins: cannot decline an approved request", () => {
    const { request } = openRequest();
    approveRefundRequest(testDb, {
      refundRequestId: request.id,
      staffUserId: staff.id,
    });

    const result = declineRefundRequest(testDb, {
      refundRequestId: request.id,
      staffUserId: otherStaff.id,
      declineReason: "Changed my mind about this.",
    });

    expect(result).toEqual({ ok: false, reason: "already-decided" });
    expect(getRequest(request.id).status).toBe(
      schema.RefundRequestStatus.Approved
    );
    expect(getRequest(request.id).declineReason).toBeNull();
  });
});

describe("getRefundRules", () => {
  it("shows each rule as met for a fresh, unwatched purchase", () => {
    const { purchase } = openRequest();
    const rules = getRefundRules(testDb, {
      purchase,
      userId: base.user.id,
      courseId: base.course.id,
      asOf: new Date(),
    });
    expect(rules).toMatchObject({
      notClaimedTeamSeat: true,
      withinRefundWindow: true,
      underWatchLimit: true,
    });
  });

  it("flags a request judged after the 14-day window", () => {
    const { purchase } = openRequest();
    const later = new Date(purchase.createdAt);
    later.setDate(later.getDate() + 20);
    const rules = getRefundRules(testDb, {
      purchase,
      userId: base.user.id,
      courseId: base.course.id,
      asOf: later,
    });
    expect(rules.withinRefundWindow).toBe(false);
  });

  it("flags two hours or more watched, and a claimed team seat", () => {
    const { purchase } = openRequest();
    const module = testDb
      .insert(schema.modules)
      .values({ courseId: base.course.id, title: "M", position: 1 })
      .returning()
      .get();
    const lesson = testDb
      .insert(schema.lessons)
      .values({ moduleId: module.id, title: "L", position: 1 })
      .returning()
      .get();
    testDb
      .insert(schema.videoWatchEvents)
      .values({
        userId: base.user.id,
        lessonId: lesson.id,
        eventType: "pause",
        positionSeconds: 7200,
      })
      .run();
    const team = testDb.insert(schema.teams).values({}).returning().get();
    testDb
      .insert(schema.coupons)
      .values({
        teamId: team.id,
        code: "SEAT",
        courseId: base.course.id,
        purchaseId: purchase.id,
        redeemedAt: new Date().toISOString(),
      })
      .run();

    const rules = getRefundRules(testDb, {
      purchase,
      userId: base.user.id,
      courseId: base.course.id,
      asOf: new Date(),
    });
    expect(rules.underWatchLimit).toBe(false);
    expect(rules.notClaimedTeamSeat).toBe(false);
  });
});

describe("buildRefundDecisionEmail", () => {
  const input = {
    learnerName: "Liam",
    learnerEmail: "liam@example.com",
    courseTitle: "Intro",
    amount: 7900,
  };

  it("includes the Decline Reason when declined", () => {
    const email = buildRefundDecisionEmail({
      ...input,
      outcome: "declined",
      declineReason: "Too much of the course was watched.",
    });
    expect(email.body).toContain("Too much of the course was watched.");
  });

  it("states the full amount when approved", () => {
    const email = buildRefundDecisionEmail({ ...input, outcome: "approved" });
    expect(email.body).toContain("$79.00");
  });
});
