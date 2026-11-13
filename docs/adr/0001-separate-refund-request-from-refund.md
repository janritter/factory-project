# Separate the Refund Request from the Refund

The `refunds` table stored Refund Requests (the learner's ask and Staff's Open/Approved/Declined decision), while the glossary reserves "Refund" for the money going back, with its own Pending/Issued/Failed lifecycle. We split them into two entities: `refund_requests` for the ask and decision, and a separate Refund created as Pending when a Refund Request is approved. The two lifecycles change independently — a Failed Refund leaves its Refund Request Approved, because the decision hasn't changed — and forcing both onto one status column would mix a human decision with a payout outcome.

## Considered Options

- **Keep one table and extend `RefundStatus`** with pending/issued/failed. Rejected: a single status can't say "approved, and the payout failed" without conflating the two, and a Declined Refund Request would carry payout columns that never apply.
- **Keep the `refunds` name for requests and call the money something else.** Rejected: it contradicts the glossary, which is the language Staff and learners actually use.

## Consequences

- Approving a Refund Request creates a Pending Refund. Nothing yet moves it to Issued or Failed, since there is no payment provider; that is separate work.
- Course access is removed on approval, not on payout, so access never depends on the missing payout step.
