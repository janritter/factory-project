import { and, eq } from "drizzle-orm";
import {
  courses,
  enrollments,
  purchases,
  refundRequests,
  refunds,
  RefundRequestStatus,
  RefundStatus,
  users,
} from "~/db/schema";
import { formatPrice } from "~/lib/utils";
import type { Db } from "~/lib/refund-eligibility.server";

export type DecisionResult =
  | { ok: true; refundRequestId: number }
  | { ok: false; reason: "not-found" | "already-decided" };

/**
 * Staff approve a Refund Request. In one transaction: the request becomes
 * Approved, a Pending Refund for the full amount paid is created, and the
 * learner loses access to the course. First decision wins — if the request is
 * no longer Open, nothing changes.
 */
export function approveRefundRequest(
  database: Db,
  input: { refundRequestId: number; staffUserId: number }
): DecisionResult {
  return database.transaction((tx) => {
    const request = tx
      .select()
      .from(refundRequests)
      .where(eq(refundRequests.id, input.refundRequestId))
      .get();
    if (!request) return { ok: false, reason: "not-found" } as const;

    const decided = tx
      .update(refundRequests)
      .set({
        status: RefundRequestStatus.Approved,
        resolvedAt: new Date().toISOString(),
        resolvedByUserId: input.staffUserId,
      })
      .where(
        and(
          eq(refundRequests.id, input.refundRequestId),
          eq(refundRequests.status, RefundRequestStatus.Open)
        )
      )
      .returning({ id: refundRequests.id })
      .get();
    if (!decided) return { ok: false, reason: "already-decided" } as const;

    const purchase = tx
      .select()
      .from(purchases)
      .where(eq(purchases.id, request.purchaseId))
      .get()!;

    tx.insert(refunds)
      .values({
        refundRequestId: request.id,
        amount: purchase.amountPaid,
        status: RefundStatus.Pending,
      })
      .run();

    tx.delete(enrollments)
      .where(
        and(
          eq(enrollments.userId, purchase.userId),
          eq(enrollments.courseId, purchase.courseId)
        )
      )
      .run();

    return { ok: true, refundRequestId: request.id } as const;
  });
}

/**
 * Staff decline a Refund Request with a Decline Reason. First decision wins.
 */
export function declineRefundRequest(
  database: Db,
  input: {
    refundRequestId: number;
    staffUserId: number;
    declineReason: string;
  }
): DecisionResult {
  const exists = database
    .select({ id: refundRequests.id })
    .from(refundRequests)
    .where(eq(refundRequests.id, input.refundRequestId))
    .get();
  if (!exists) return { ok: false, reason: "not-found" };

  const decided = database
    .update(refundRequests)
    .set({
      status: RefundRequestStatus.Declined,
      declineReason: input.declineReason,
      resolvedAt: new Date().toISOString(),
      resolvedByUserId: input.staffUserId,
    })
    .where(
      and(
        eq(refundRequests.id, input.refundRequestId),
        eq(refundRequests.status, RefundRequestStatus.Open)
      )
    )
    .returning({ id: refundRequests.id })
    .get();
  if (!decided) return { ok: false, reason: "already-decided" };

  return { ok: true, refundRequestId: input.refundRequestId };
}

/**
 * The email telling the learner their Refund Request was decided. There is no
 * mail transport wired up yet, so the built message goes to the server log.
 */
export function buildRefundDecisionEmail(input: {
  learnerName: string;
  learnerEmail: string;
  courseTitle: string;
  amount: number;
  outcome: "approved" | "declined";
  declineReason?: string | null;
}) {
  const lines =
    input.outcome === "approved"
      ? [
          `Hi ${input.learnerName},`,
          "",
          `We have approved your refund request for "${input.courseTitle}".`,
          `The refund is for ${formatPrice(input.amount)}, the full amount you paid. It is pending until the money has been sent back to you.`,
          "",
          "You no longer have access to the course.",
        ]
      : [
          `Hi ${input.learnerName},`,
          "",
          `We have declined your refund request for "${input.courseTitle}".`,
          "",
          `Reason: ${input.declineReason ?? ""}`,
          "",
          "You keep access to the course.",
        ];

  return {
    to: input.learnerEmail,
    subject: `Refund request ${input.outcome} — ${input.courseTitle}`,
    body: [...lines, "", "— The Cadence team"].join("\n"),
  };
}

export function logRefundDecisionEmail(
  database: Db,
  refundRequestId: number,
  outcome: "approved" | "declined"
) {
  const row = database
    .select({
      learnerName: users.name,
      learnerEmail: users.email,
      courseTitle: courses.title,
      amount: purchases.amountPaid,
      declineReason: refundRequests.declineReason,
    })
    .from(refundRequests)
    .innerJoin(purchases, eq(refundRequests.purchaseId, purchases.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(eq(refundRequests.id, refundRequestId))
    .get();
  if (!row) return;

  const email = buildRefundDecisionEmail({ ...row, outcome });
  console.log(`[email] to=${email.to} subject=${email.subject}\n${email.body}`);
}
