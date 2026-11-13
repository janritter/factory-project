import { Link } from "react-router";
import { desc, eq } from "drizzle-orm";
import type { Route } from "./+types/admin.refund-requests";
import { db } from "~/db";
import {
  courses,
  purchases,
  refundRequests,
  RefundRequestStatus,
  users,
} from "~/db/schema";
import { requireRefundStaff } from "~/lib/access.server";
import { formatPrice } from "~/lib/utils";
import { Card, CardContent } from "~/components/ui/card";
import { StaffErrorBoundary } from "~/components/staff-error-boundary";

export function meta() {
  return [{ title: "Refund Requests — Cadence" }];
}

const FILTERS = [
  { status: RefundRequestStatus.Open, label: "Open" },
  { status: RefundRequestStatus.Approved, label: "Approved" },
  { status: RefundRequestStatus.Declined, label: "Declined" },
];

export async function loader({ request }: Route.LoaderArgs) {
  await requireRefundStaff(request);

  const param = new URL(request.url).searchParams.get("status");
  const status =
    FILTERS.find((f) => f.status === param)?.status ??
    RefundRequestStatus.Open;

  const rows = db
    .select({
      id: refundRequests.id,
      learnerName: users.name,
      courseTitle: courses.title,
      amountPaid: purchases.amountPaid,
      requestedAt: refundRequests.requestedAt,
      resolvedAt: refundRequests.resolvedAt,
    })
    .from(refundRequests)
    .innerJoin(purchases, eq(refundRequests.purchaseId, purchases.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(eq(refundRequests.status, status))
    .orderBy(
      status === RefundRequestStatus.Open
        ? refundRequests.requestedAt
        : desc(refundRequests.resolvedAt)
    )
    .all();

  return { status, rows };
}

export default function RefundRequests({ loaderData }: Route.ComponentProps) {
  const { status, rows } = loaderData;
  const label = FILTERS.find((f) => f.status === status)!.label;

  return (
    <div className="mx-auto max-w-5xl p-6 lg:p-8">
      <h1 className="text-3xl font-bold">Refund Requests</h1>
      <p className="mt-1 text-muted-foreground">
        Decide the Refund Requests learners have raised.
      </p>

      <div className="mt-6 flex gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.status}
            to={`?status=${f.status}`}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              f.status === status
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <Card className="mt-6">
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              No {label.toLowerCase()} Refund Requests.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Learner</th>
                  <th className="px-4 py-3 font-medium">Course</th>
                  <th className="px-4 py-3 font-medium">Amount paid</th>
                  <th className="px-4 py-3 font-medium">Requested</th>
                  {status !== RefundRequestStatus.Open && (
                    <th className="px-4 py-3 font-medium">Decided</th>
                  )}
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="px-4 py-3">{row.learnerName}</td>
                    <td className="px-4 py-3">{row.courseTitle}</td>
                    <td className="px-4 py-3">{formatPrice(row.amountPaid)}</td>
                    <td className="px-4 py-3">
                      {new Date(row.requestedAt).toLocaleDateString()}
                    </td>
                    {status !== RefundRequestStatus.Open && (
                      <td className="px-4 py-3">
                        {row.resolvedAt
                          ? new Date(row.resolvedAt).toLocaleDateString()
                          : ""}
                      </td>
                    )}
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/admin/refund-requests/${row.id}`}
                        className="font-medium hover:underline"
                      >
                        {status === RefundRequestStatus.Open
                          ? "Review"
                          : "View"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <StaffErrorBoundary error={error} />;
}
