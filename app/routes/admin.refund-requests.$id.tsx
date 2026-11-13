import { Form, Link, data, redirect, useNavigation } from "react-router";
import { and, eq, lt, ne, desc } from "drizzle-orm";
import { z } from "zod";
import type { Route } from "./+types/admin.refund-requests.$id";
import { db } from "~/db";
import {
  courses,
  purchases,
  refundRequests,
  RefundRequestStatus,
  users,
} from "~/db/schema";
import { requireRefundStaff } from "~/lib/access.server";
import { parseFormData, parseParams } from "~/lib/validation";
import { formatPrice } from "~/lib/utils";
import {
  REFUND_WINDOW_DAYS,
  MAX_WATCHED_HOURS,
  getLessonsCompleted,
  getRefundRules,
} from "~/lib/refund-eligibility.server";
import {
  approveRefundRequest,
  declineRefundRequest,
  logRefundDecisionEmail,
} from "~/lib/refund-requests.server";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { StaffErrorBoundary } from "~/components/staff-error-boundary";

const paramsSchema = z.object({ id: z.coerce.number().int() });

const actionSchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("approve") }),
  z.object({
    intent: z.literal("decline"),
    declineReason: z
      .string()
      .trim()
      .min(10, "Tell the learner a little more about why.")
      .max(1000, "Please keep the Decline Reason under 1000 characters."),
  }),
]);

export function meta() {
  return [{ title: "Refund Request — Cadence" }];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  await requireRefundStaff(request);
  const { id } = parseParams(params, paramsSchema);

  const row = db
    .select({
      id: refundRequests.id,
      status: refundRequests.status,
      reason: refundRequests.reason,
      declineReason: refundRequests.declineReason,
      requestedAt: refundRequests.requestedAt,
      resolvedAt: refundRequests.resolvedAt,
      purchaseId: purchases.id,
      purchasedAt: purchases.createdAt,
      amountPaid: purchases.amountPaid,
      country: purchases.country,
      learnerId: users.id,
      learnerName: users.name,
      courseId: courses.id,
      courseTitle: courses.title,
    })
    .from(refundRequests)
    .innerJoin(purchases, eq(refundRequests.purchaseId, purchases.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(eq(refundRequests.id, id))
    .get();

  if (!row) throw data("Refund Request not found.", { status: 404 });

  const rules = getRefundRules(db, {
    purchase: { id: row.purchaseId, createdAt: row.purchasedAt },
    userId: row.learnerId,
    courseId: row.courseId,
    asOf: new Date(row.requestedAt),
  });
  const lessonsProgress = getLessonsCompleted(db, row.learnerId, row.courseId);

  const earlierRequests = db
    .select({
      id: refundRequests.id,
      status: refundRequests.status,
      reason: refundRequests.reason,
      declineReason: refundRequests.declineReason,
      requestedAt: refundRequests.requestedAt,
    })
    .from(refundRequests)
    .where(
      and(
        eq(refundRequests.purchaseId, row.purchaseId),
        ne(refundRequests.id, row.id),
        lt(refundRequests.requestedAt, row.requestedAt)
      )
    )
    .orderBy(desc(refundRequests.requestedAt))
    .all();

  return {
    request: row,
    rules: [
      {
        label: `Requested within ${REFUND_WINDOW_DAYS} days of purchase`,
        met: rules.withinRefundWindow,
        detail: `Last day of the window: ${rules.lastDayOfWindow}`,
      },
      {
        label: `Watched less than ${MAX_WATCHED_HOURS} hours`,
        met: rules.underWatchLimit,
        detail: `${formatWatchTime(rules.watchedSeconds)} watched`,
      },
      {
        label: "Not a claimed team seat",
        met: rules.notClaimedTeamSeat,
        detail: rules.notClaimedTeamSeat
          ? "Bought by the learner"
          : "Seat was claimed from a team licence",
      },
    ],
    watchedSeconds: rules.watchedSeconds,
    lessonsProgress,
    earlierRequests,
  };
}

function formatWatchTime(seconds: number) {
  const minutes = Math.round(seconds / 60);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export async function action({ params, request }: Route.ActionArgs) {
  const { userId } = await requireRefundStaff(request);
  const { id } = parseParams(params, paramsSchema);

  const parsed = parseFormData(await request.formData(), actionSchema);
  if (!parsed.success) {
    return data({ errors: parsed.errors }, { status: 400 });
  }

  const result =
    parsed.data.intent === "approve"
      ? approveRefundRequest(db, { refundRequestId: id, staffUserId: userId })
      : declineRefundRequest(db, {
          refundRequestId: id,
          staffUserId: userId,
          declineReason: parsed.data.declineReason,
        });

  if (!result.ok) {
    if (result.reason === "not-found") {
      throw data("Refund Request not found.", { status: 404 });
    }
    return data(
      {
        errors: {
          form: "Another member of Staff has already decided this Refund Request. Decisions are final.",
        },
      },
      { status: 409 }
    );
  }

  logRefundDecisionEmail(
    db,
    id,
    parsed.data.intent === "approve" ? "approved" : "declined"
  );

  return redirect("/admin/refund-requests");
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

export default function RefundRequestDetail({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { request, rules, lessonsProgress, earlierRequests } = loaderData;
  const navigation = useNavigation();
  const submitting = navigation.state !== "idle";
  const errors = (actionData as { errors?: Record<string, string> } | undefined)
    ?.errors;
  const isOpen = request.status === RefundRequestStatus.Open;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 lg:p-8">
      <nav className="text-sm text-muted-foreground">
        <Link to="/admin/refund-requests" className="hover:text-foreground">
          Refund Requests
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{request.learnerName}</span>
      </nav>

      <h1 className="text-3xl font-bold">
        Refund Request — {request.courseTitle}
      </h1>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Purchase</h2>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4">
            <Field label="Learner">{request.learnerName}</Field>
            <Field label="Course">{request.courseTitle}</Field>
            <Field label="Purchased">
              {new Date(request.purchasedAt).toLocaleDateString()}
            </Field>
            <Field label="Amount paid">{formatPrice(request.amountPaid)}</Field>
            <Field label="Purchase country">{request.country ?? "Unknown"}</Field>
            <Field label="Watch time">
              {formatWatchTime(loaderData.watchedSeconds)}
            </Field>
            <Field label="Lessons completed">
              {lessonsProgress.completed} of {lessonsProgress.total}
            </Field>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Refund Request</h2>
          <p className="text-sm text-muted-foreground">
            Requested {new Date(request.requestedAt).toLocaleDateString()}
          </p>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm">{request.reason}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Eligibility rules</h2>
          <p className="text-sm text-muted-foreground">
            Staff may approve a Refund Request even when a rule is broken.
          </p>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {rules.map((rule) => (
              <li key={rule.label} className="flex items-start gap-3">
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    rule.met
                      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                      : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                  }`}
                >
                  {rule.met ? "Met" : "Broken"}
                </span>
                <span>
                  {rule.label}
                  <span className="block text-muted-foreground">
                    {rule.detail}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {earlierRequests.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">
              Earlier Refund Requests on this purchase
            </h2>
          </CardHeader>
          <CardContent className="space-y-3">
            {earlierRequests.map((earlier) => (
              <div key={earlier.id} className="rounded-md border p-3 text-sm">
                <p className="font-medium">
                  {new Date(earlier.requestedAt).toLocaleDateString()} —{" "}
                  {earlier.status === RefundRequestStatus.Approved
                    ? "Approved"
                    : earlier.status === RefundRequestStatus.Declined
                      ? "Declined"
                      : "Open"}
                </p>
                <p className="mt-1">{earlier.reason}</p>
                {earlier.declineReason && (
                  <p className="mt-1 text-muted-foreground">
                    Decline Reason: {earlier.declineReason}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {isOpen ? (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">Decide</h2>
            <p className="text-sm text-muted-foreground">
              Decisions are final. Approving refunds the full{" "}
              {formatPrice(request.amountPaid)} and removes the learner&apos;s
              access to the course immediately.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {errors?.form && (
              <p role="alert" className="text-sm text-destructive">
                {errors.form}
              </p>
            )}
            <Form method="post">
              <input type="hidden" name="intent" value="approve" />
              <Button type="submit" disabled={submitting}>
                Approve and refund {formatPrice(request.amountPaid)}
              </Button>
            </Form>
            <Form method="post" className="space-y-2">
              <input type="hidden" name="intent" value="decline" />
              <label htmlFor="declineReason" className="text-sm font-medium">
                Decline Reason (shown to the learner)
              </label>
              <Textarea
                id="declineReason"
                name="declineReason"
                rows={3}
                minLength={10}
                maxLength={1000}
                required
              />
              {errors?.declineReason && (
                <p className="text-sm text-destructive">
                  {errors.declineReason}
                </p>
              )}
              <Button type="submit" variant="outline" disabled={submitting}>
                Decline
              </Button>
            </Form>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">
              {request.status === RefundRequestStatus.Approved
                ? "Approved"
                : "Declined"}
            </h2>
            {request.resolvedAt && (
              <p className="text-sm text-muted-foreground">
                Decided {new Date(request.resolvedAt).toLocaleDateString()}
              </p>
            )}
          </CardHeader>
          {request.declineReason && (
            <CardContent>
              <p className="text-sm">
                <span className="font-medium">Decline Reason: </span>
                {request.declineReason}
              </p>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <StaffErrorBoundary error={error} />;
}
